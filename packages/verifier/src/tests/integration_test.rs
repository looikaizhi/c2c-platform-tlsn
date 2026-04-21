//! Integration test for the verifier server with webhook functionality.
//!
//! This test validates the complete end-to-end flow:
//! 1. Verifier server with webhook configuration
//! 2. Prover connecting via WebSocket
//! 3. MPC-TLS verification against raw.githubusercontent.com
//! 4. Slim webhook delivery to test server (SlimWebhookPayload format)
//! 5. Proof store API (GET /proof/:id, PATCH /proof/:id/tx)

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use async_tungstenite::tungstenite::Message;
use axum::{extract::State, routing::post, Json, Router};
use futures_util::{io::AsyncRead, io::AsyncWrite, StreamExt};
use http_body_util::Empty;
use hyper::{body::Bytes, Request, StatusCode};
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::net::TcpStream;
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;
use tokio_util::compat::{FuturesAsyncReadCompatExt, TokioAsyncReadCompatExt};
use tower_http::cors::CorsLayer;
use tracing::info;
use ws_stream_tungstenite::WsStream;

use tlsn::{
    config::{
        prove::ProveConfig, prover::ProverConfig, tls::TlsClientConfig, tls_commit::TlsCommitConfig,
    },
    prover::Prover,
    Session,
};

// ============================================================================
// Test Configuration Constants
// ============================================================================

const VERIFIER_PORT: u16 = 17047;
const WEBHOOK_PORT: u16 = 18080;
const MAX_SENT_DATA: usize = 4096;
const MAX_RECV_DATA: usize = 16384;

// ============================================================================
// Types matching the verifier's WebSocket protocol
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
enum HandlerType {
    Sent,
    Recv,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum HandlerPart {
    StartLine,
    Protocol,
    Method,
    RequestTarget,
    StatusCode,
    Headers,
    Body,
    All,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Handler {
    #[serde(rename = "type")]
    handler_type: HandlerType,
    part: HandlerPart,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RangeWithHandler {
    start: usize,
    end: usize,
    handler: Handler,
}

// ============================================================================
// Test Webhook Server
// ============================================================================

/// Simple HTTP server that captures POST requests for verification
struct TestWebhookServer {
    received_payloads: Arc<Mutex<Vec<Value>>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    handle: Option<JoinHandle<()>>,
}

impl TestWebhookServer {
    async fn start(port: u16) -> Self {
        let received_payloads = Arc::new(Mutex::new(Vec::new()));
        let payloads_clone = received_payloads.clone();

        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        let app = Router::new()
            .route("/", post(webhook_handler))
            .layer(CorsLayer::permissive())
            .with_state(payloads_clone);

        let addr = SocketAddr::from(([127, 0, 0, 1], port));

        let handle = tokio::spawn(async move {
            let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
            info!("[TestWebhookServer] Listening on {}", addr);

            axum::serve(listener, app.into_make_service())
                .with_graceful_shutdown(async {
                    let _ = shutdown_rx.await;
                    info!("[TestWebhookServer] Shutting down");
                })
                .await
                .unwrap();
        });

        // Wait for server to be ready
        tokio::time::sleep(Duration::from_millis(100)).await;

        Self {
            received_payloads,
            shutdown_tx: Some(shutdown_tx),
            handle: Some(handle),
        }
    }

    async fn get_payloads(&self) -> Vec<Value> {
        self.received_payloads.lock().await.clone()
    }

    async fn shutdown(mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = self.handle.take() {
            let _ = handle.await;
        }
    }
}

async fn webhook_handler(
    State(payloads): State<Arc<Mutex<Vec<Value>>>>,
    Json(body): Json<Value>,
) -> StatusCode {
    info!("[TestWebhookServer] Received webhook: {:?}", body);
    payloads.lock().await.push(body);
    StatusCode::OK
}

// ============================================================================
// Verifier Server Launcher
// ============================================================================

async fn start_verifier_server(webhook_port: u16, verifier_port: u16) -> JoinHandle<()> {
    // Create config with webhook for raw.githubusercontent.com
    let config_yaml = format!(
        r#"
webhooks:
  "raw.githubusercontent.com":
    url: "http://127.0.0.1:{}"
    headers: {{}}
"#,
        webhook_port
    );

    let config: crate::Config = serde_yaml::from_str(&config_yaml).unwrap();

    // Use in-memory SQLite for tests (R.11 — isolated per test run)
    let conn = crate::init_db(":memory:");
    let db = Arc::new(std::sync::Mutex::new(conn));

    let app_state = Arc::new(crate::AppState {
        sessions: Arc::new(Mutex::new(HashMap::new())),
        config: Arc::new(config),
        db,
        proof_api_key: None,
        ws_rate_limiter: Arc::new(std::sync::Mutex::new(HashMap::new())),
    });

    let app = Router::new()
        .route("/health", axum::routing::get(|| async { "ok" }))
        .route("/info", axum::routing::get(crate::info_handler))
        .route("/session", axum::routing::get(crate::session_ws_handler))
        .route("/verifier", axum::routing::get(crate::verifier_ws_handler))
        .route("/proxy", axum::routing::get(crate::proxy_ws_handler))
        .route("/proof/:session_id", axum::routing::get(crate::get_proof_handler))
        .route("/proof/:session_id/tx", axum::routing::patch(crate::patch_proof_tx_handler))
        .route("/proof", axum::routing::get(crate::get_proof_by_tx_handler))
        .route("/test/seed", axum::routing::post(crate::test_seed_proof_handler))
        .layer(CorsLayer::permissive())
        .with_state(app_state);

    let addr = SocketAddr::from(([127, 0, 0, 1], verifier_port));

    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
        info!("[TestVerifier] Listening on {}", addr);
        axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await.unwrap();
    })
}

// ============================================================================
// WebSocket Session Client
// ============================================================================

/// Client that implements the /session WebSocket protocol
struct SessionClient {
    ws: async_tungstenite::WebSocketStream<tokio_util::compat::Compat<TcpStream>>,
    session_id: Option<String>,
}

impl SessionClient {
    async fn connect(verifier_url: &str) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/session", verifier_url);
        info!("[SessionClient] Connecting to {}", url);

        // Parse the URL to get host and port
        let parsed = url.parse::<http::Uri>()?;
        let host = parsed.host().ok_or("Missing host in URL")?;
        let port = parsed.port_u16().unwrap_or(80);

        // Connect via TCP and wrap for futures_io compatibility
        let tcp_stream = TcpStream::connect((host, port)).await?;
        let stream = tcp_stream.compat();

        // Perform WebSocket handshake
        let (ws, _) = async_tungstenite::client_async(&url, stream).await?;
        info!("[SessionClient] Connected");

        Ok(Self {
            ws,
            session_id: None,
        })
    }

    async fn register(
        &mut self,
        max_recv_data: usize,
        max_sent_data: usize,
        session_data: HashMap<String, String>,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let msg = json!({
            "type": "register",
            "maxRecvData": max_recv_data,
            "maxSentData": max_sent_data,
            "sessionData": session_data
        });

        info!("[SessionClient] Sending register: {:?}", msg);
        self.ws.send(Message::Text(msg.to_string().into())).await?;

        // Wait for session_registered response
        while let Some(msg) = self.ws.next().await {
            match msg? {
                Message::Text(text) => {
                    let response: Value = serde_json::from_str(&text)?;
                    info!("[SessionClient] Received: {:?}", response);

                    if response["type"] == "session_registered" {
                        let session_id = response["sessionId"]
                            .as_str()
                            .ok_or("Missing sessionId")?
                            .to_string();
                        self.session_id = Some(session_id.clone());
                        return Ok(session_id);
                    } else if response["type"] == "error" {
                        return Err(format!(
                            "Server error: {}",
                            response["message"].as_str().unwrap_or("unknown")
                        )
                        .into());
                    }
                }
                Message::Close(_) => {
                    return Err("Connection closed unexpectedly".into());
                }
                _ => {}
            }
        }

        Err("Connection closed before registration".into())
    }

    async fn send_reveal_config(
        &mut self,
        sent: Vec<RangeWithHandler>,
        recv: Vec<RangeWithHandler>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let msg = json!({
            "type": "reveal_config",
            "sent": sent,
            "recv": recv
        });

        info!(
            "[SessionClient] Sending reveal_config: {} sent, {} recv",
            sent.len(),
            recv.len()
        );
        self.ws.send(Message::Text(msg.to_string().into())).await?;

        Ok(())
    }

    /// Wait for the server's `transcript_ready` message and return the commitments array.
    async fn wait_for_transcript_ready(
        &mut self,
    ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
        info!("[SessionClient] Waiting for transcript_ready...");

        while let Some(msg) = self.ws.next().await {
            match msg? {
                Message::Text(text) => {
                    let response: Value = serde_json::from_str(&text)?;
                    info!("[SessionClient] Received: {}", response["type"]);

                    if response["type"] == "transcript_ready" {
                        let commitments = response["transcriptCommitments"]
                            .as_array()
                            .ok_or("Missing transcriptCommitments in transcript_ready")?
                            .clone();
                        info!(
                            "[SessionClient] Got transcript_ready with {} commitments",
                            commitments.len()
                        );
                        return Ok(commitments);
                    } else if response["type"] == "error" {
                        return Err(format!(
                            "Server error: {}",
                            response["message"].as_str().unwrap_or("unknown")
                        )
                        .into());
                    }
                    // Ignore other messages (e.g. session_registered already consumed)
                }
                Message::Close(_) => {
                    return Err("Connection closed while waiting for transcript_ready".into());
                }
                _ => {}
            }
        }

        Err("Connection closed before transcript_ready".into())
    }

    async fn wait_for_completion(
        &mut self,
    ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
        info!("[SessionClient] Waiting for session completion...");

        while let Some(msg) = self.ws.next().await {
            match msg? {
                Message::Text(text) => {
                    let response: Value = serde_json::from_str(&text)?;
                    info!("[SessionClient] Received: {}", response["type"]);

                    if response["type"] == "session_completed" {
                        let results = response["results"]
                            .as_array()
                            .ok_or("Missing results")?
                            .clone();
                        return Ok(results);
                    } else if response["type"] == "error" {
                        return Err(format!(
                            "Server error: {}",
                            response["message"].as_str().unwrap_or("unknown")
                        )
                        .into());
                    }
                }
                Message::Close(_) => {
                    return Err("Connection closed unexpectedly".into());
                }
                _ => {}
            }
        }

        Err("Connection closed before completion".into())
    }
}

// ============================================================================
// Prover Implementation
// ============================================================================

/// Helper to connect WebSocket with futures_io compatible stream
async fn connect_ws(
    url: &str,
) -> Result<
    async_tungstenite::WebSocketStream<tokio_util::compat::Compat<TcpStream>>,
    Box<dyn std::error::Error + Send + Sync>,
> {
    let parsed = url.parse::<http::Uri>()?;
    let host = parsed.host().ok_or("Missing host in URL")?;
    let port = parsed.port_u16().unwrap_or(80);

    let tcp_stream = TcpStream::connect((host, port)).await?;
    let stream = tcp_stream.compat();

    let (ws, _) = async_tungstenite::client_async(url, stream).await?;
    Ok(ws)
}

/// Helper to connect secure WebSocket (wss://) with futures_io compatible stream
async fn connect_wss(
    url: &str,
) -> Result<
    async_tungstenite::WebSocketStream<
        tokio_util::compat::Compat<tokio_native_tls::TlsStream<TcpStream>>,
    >,
    Box<dyn std::error::Error + Send + Sync>,
> {
    let parsed = url.parse::<http::Uri>()?;
    let host = parsed.host().ok_or("Missing host in URL")?.to_string();
    let port = parsed.port_u16().unwrap_or(443);

    let tcp_stream = TcpStream::connect((&*host, port)).await?;

    // Create TLS connector
    let connector = native_tls::TlsConnector::new()?;
    let connector = tokio_native_tls::TlsConnector::from(connector);
    let tls_stream = connector.connect(&host, tcp_stream).await?;

    let stream = tls_stream.compat();
    let (ws, _) = async_tungstenite::client_async(url, stream).await?;
    Ok(ws)
}

/// Helper function that performs MPC-TLS and HTTP request with a given proxy stream
async fn run_prover_with_stream<S>(
    prover: Prover,
    tls_commit_config: TlsCommitConfig,
    tls_client_config: TlsClientConfig,
    proxy_stream: S,
) -> Result<(Vec<u8>, Vec<u8>), Box<dyn std::error::Error + Send + Sync>>
where
    S: AsyncRead + AsyncWrite + Send + Unpin + 'static,
{
    // 5. Start the TLS commitment protocol
    let prover = prover
        .commit(tls_commit_config)
        .await
        .map_err(|e| format!("Commitment failed: {}", e))?;

    // 6. Pass proxy connection into the prover for TLS
    let (mpc_tls_connection, prover_fut) = prover
        .connect(tls_client_config, proxy_stream)
        .await
        .map_err(|e| format!("TLS connect failed: {}", e))?;

    info!("[Prover] MPC-TLS connection established");

    // Wrap for hyper compatibility
    let mpc_tls_connection = TokioIo::new(mpc_tls_connection.compat());

    // Spawn the prover task
    let prover_task = tokio::spawn(prover_fut);

    // 7. HTTP handshake
    let (mut request_sender, connection) =
        hyper::client::conn::http1::handshake(mpc_tls_connection)
            .await
            .map_err(|e| format!("HTTP handshake failed: {}", e))?;

    tokio::spawn(connection);

    // 8. Send HTTP GET request
    info!("[Prover] Sending GET /tlsnotary/tlsn/refs/heads/main/crates/server-fixture/server/src/data/1kb.json");
    let request = Request::builder()
        .uri("/tlsnotary/tlsn/refs/heads/main/crates/server-fixture/server/src/data/1kb.json")
        .header("Host", "raw.githubusercontent.com")
        .header("Accept", "application/json")
        .header("Connection", "close")
        .method("GET")
        .body(Empty::<Bytes>::new())
        .unwrap();

    let response = request_sender
        .send_request(request)
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    info!("[Prover] Response status: {}", response.status());
    assert_eq!(response.status(), StatusCode::OK);

    // 9. Wait for prover task to complete
    let mut prover = prover_task
        .await
        .map_err(|e| format!("Prover task panicked: {}", e))?
        .map_err(|e| format!("Prover task failed: {}", e))?;

    let sent = prover.transcript().sent().to_vec();
    let recv = prover.transcript().received().to_vec();

    info!(
        "[Prover] Transcript: sent={} bytes, recv={} bytes",
        sent.len(),
        recv.len()
    );

    // 10. Build proof configuration (reveal everything including server identity)
    let mut prove_config = ProveConfig::builder(prover.transcript());
    prove_config.server_identity();
    prove_config
        .reveal_sent(&(0..sent.len()))
        .map_err(|e| format!("reveal_sent failed: {}", e))?;
    prove_config
        .reveal_recv(&(0..recv.len()))
        .map_err(|e| format!("reveal_recv failed: {}", e))?;
    let prove_config = prove_config
        .build()
        .map_err(|e| format!("build proof failed: {}", e))?;

    // 11. Send proof to verifier
    info!("[Prover] Sending proof to verifier");
    prover
        .prove(&prove_config)
        .await
        .map_err(|e| format!("prove failed: {}", e))?;

    prover
        .close()
        .await
        .map_err(|e| format!("close failed: {}", e))?;

    info!("[Prover] Proof sent successfully");

    Ok((sent, recv))
}

/// Prover that connects to verifier and performs MPC-TLS with raw.githubusercontent.com
async fn run_prover(
    verifier_ws_url: String,
    proxy_url: String,
    max_sent_data: usize,
    max_recv_data: usize,
) -> Result<(Vec<u8>, Vec<u8>), Box<dyn std::error::Error + Send + Sync>> {
    info!("[Prover] Connecting to verifier at {}", verifier_ws_url);

    // 1. Connect to verifier WebSocket (ws://)
    let verifier_ws = connect_ws(&verifier_ws_url).await?;
    info!("[Prover] Connected to verifier");

    // Convert WebSocket to stream compatible with tlsn
    let verifier_stream = WsStream::new(verifier_ws);

    // 2. Create session with verifier stream
    let session = Session::new(verifier_stream);
    let (driver, mut handle) = session.split();

    // Spawn the session driver in the background
    let driver_task = tokio::spawn(driver);

    // 3. Create TLS commit config for MPC protocol
    use tlsn::config::tls_commit::{mpc::MpcTlsConfig, TlsCommitProtocolConfig};
    let mpc_config = MpcTlsConfig::builder()
        .max_sent_data(max_sent_data)
        .max_recv_data(max_recv_data)
        .build()
        .map_err(|e| format!("Failed to build MPC TLS config: {}", e))?;

    let tls_commit_config = TlsCommitConfig::builder()
        .protocol(TlsCommitProtocolConfig::Mpc(mpc_config))
        .build()
        .map_err(|e| format!("Failed to build TLS commit config: {}", e))?;

    // 4. Create prover config
    let prover_config = ProverConfig::builder()
        .build()
        .map_err(|e| format!("Failed to build prover config: {}", e))?;

    info!("[Prover] Setting up MPC-TLS with verifier");

    // 5. Create prover via handle
    let prover = handle
        .new_prover(prover_config)
        .map_err(|e| format!("Failed to create prover: {}", e))?;

    // 6. Create TLS client config with server name and root certs
    use tlsn::{connection::ServerName, webpki::RootCertStore};
    let tls_client_config = TlsClientConfig::builder()
        .server_name(ServerName::Dns(
            "raw.githubusercontent.com".try_into().unwrap(),
        ))
        .root_store(RootCertStore::mozilla())
        .build()
        .map_err(|e| format!("Failed to build TLS client config: {}", e))?;

    info!("[Prover] Connecting to proxy at {}", proxy_url);

    // 7. Connect to proxy WebSocket and run prover
    let result = if proxy_url.starts_with("wss://") {
        let proxy_ws = connect_wss(&proxy_url).await?;
        info!("[Prover] Connected to proxy (wss)");
        let proxy_stream = WsStream::new(proxy_ws);
        run_prover_with_stream(prover, tls_commit_config, tls_client_config, proxy_stream).await
    } else {
        let proxy_ws = connect_ws(&proxy_url).await?;
        info!("[Prover] Connected to proxy (ws)");
        let proxy_stream = WsStream::new(proxy_ws);
        run_prover_with_stream(prover, tls_commit_config, tls_client_config, proxy_stream).await
    };

    // 8. Close the session handle
    handle.close();

    // 9. Wait for the driver to complete
    driver_task
        .await
        .map_err(|e| format!("Driver task failed: {}", e))?
        .map_err(|e| format!("Session driver error: {}", e))?;

    result
}

// ============================================================================
// Integration Tests
// ============================================================================

/// Test the /health endpoint
#[tokio::test]
async fn health() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    let verifier_handle = start_verifier_server(WEBHOOK_PORT + 1, VERIFIER_PORT + 1).await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("http://127.0.0.1:{}/health", VERIFIER_PORT + 1))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(resp.text().await.unwrap(), "ok");

    verifier_handle.abort();
}

/// Test the /info endpoint returns expected JSON structure
#[tokio::test]
async fn info() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    let verifier_handle = start_verifier_server(WEBHOOK_PORT + 2, VERIFIER_PORT + 2).await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("http://127.0.0.1:{}/info", VERIFIER_PORT + 2))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(resp.status(), StatusCode::OK);

    let info: Value = resp.json().await.expect("Failed to parse JSON");

    // Verify required fields exist
    info.get("version").expect("Missing version field");
    info.get("git_hash").expect("Missing git_hash field");
    info.get("tlsn_version")
        .expect("Missing tlsn_version field");

    verifier_handle.abort();
}

/// Test GET /proof/:session_id returns 404 for unknown session
#[tokio::test]
async fn test_proof_not_found() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    let verifier_handle = start_verifier_server(WEBHOOK_PORT + 3, VERIFIER_PORT + 3).await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!(
            "http://127.0.0.1:{}/proof/nonexistent-session-id",
            VERIFIER_PORT + 3
        ))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(
        resp.status(),
        StatusCode::NOT_FOUND,
        "Unknown session_id should return 404"
    );

    verifier_handle.abort();
}

#[tokio::test]
async fn test_webhook_integration_with_github() {
    // Initialize tracing for debugging
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    info!("Starting integration test");

    // 1. Start test webhook server
    info!("Starting webhook server on port {}", WEBHOOK_PORT);
    let webhook_server = TestWebhookServer::start(WEBHOOK_PORT).await;

    // 2. Start verifier server
    info!("Starting verifier server on port {}", VERIFIER_PORT);
    let verifier_handle = start_verifier_server(WEBHOOK_PORT, VERIFIER_PORT).await;

    // Wait for servers to be ready
    tokio::time::sleep(Duration::from_secs(1)).await;

    // 3. Create session client and register
    let verifier_url = format!("ws://127.0.0.1:{}", VERIFIER_PORT);
    let mut session = SessionClient::connect(&verifier_url)
        .await
        .expect("Failed to connect to session endpoint");

    let session_data = HashMap::from([("test_key".to_string(), "test_value".to_string())]);

    let session_id = session
        .register(MAX_RECV_DATA, MAX_SENT_DATA, session_data)
        .await
        .expect("Failed to register session");

    info!("Session registered: {}", session_id);

    // 4. Run prover in background (concurrent with session client waiting for transcript_ready)
    let verifier_ws_url = format!(
        "ws://127.0.0.1:{}/verifier?sessionId={}",
        VERIFIER_PORT, session_id
    );
    let proxy_url = format!(
        "ws://127.0.0.1:{}/proxy?token=raw.githubusercontent.com",
        VERIFIER_PORT
    );

    let prover_handle = tokio::spawn(async move {
        run_prover(verifier_ws_url, proxy_url, MAX_SENT_DATA, MAX_RECV_DATA).await
    });

    // 5. Wait for server to signal MPC-TLS is complete and commitments are ready.
    //    The server sends transcript_ready BEFORE it accepts reveal_config.
    let commitments = tokio::time::timeout(
        Duration::from_secs(120),
        session.wait_for_transcript_ready(),
    )
    .await
    .expect("transcript_ready timed out")
    .expect("Failed to receive transcript_ready");

    info!("Received transcript_ready with {} commitments", commitments.len());

    // 6. Build reveal_config.
    //
    // Primary path: derive one RangeWithHandler per commitment using the exact byte
    // ranges the verifier committed to (guaranteed to pass range validation).
    //
    // Fallback (commitments is empty — this TLSNotary alpha doesn't always populate
    // VerifierOutput::transcript_commitments): use the prover's own transcript sizes.
    // The prover already called reveal_sent(0..N) / reveal_recv(0..N), so these ranges
    // are within the authenticated transcript and will pass verify_reveal_config().
    // We use the prover transcript sizes obtained after wait_for_transcript_ready()
    // because the prover task has completed by that point.
    let mut sent_ranges: Vec<RangeWithHandler> = Vec::new();
    let mut recv_ranges: Vec<RangeWithHandler> = Vec::new();

    if commitments.is_empty() {
        // Fallback: we don't have commitment boundaries yet.
        // The prover is still running concurrently; wait for it first, then use its sizes.
        // (The prover completes before or shortly after transcript_ready is sent by the server.)
        info!("No commitments in transcript_ready — will use prover transcript sizes after prover completes");
    } else {
        for commitment in &commitments {
            let direction = commitment["direction"].as_str().unwrap_or("");
            let ranges_arr = commitment["ranges"].as_array();
            let (start, end) = if let Some(ranges) = ranges_arr {
                if let Some(first) = ranges.first() {
                    let s = first["start"].as_u64().unwrap_or(0) as usize;
                    let e = first["end"].as_u64().unwrap_or(0) as usize;
                    (s, e)
                } else {
                    continue;
                }
            } else {
                continue;
            };

            let range = RangeWithHandler {
                start,
                end,
                handler: Handler {
                    handler_type: if direction == "SENT" {
                        HandlerType::Sent
                    } else {
                        HandlerType::Recv
                    },
                    part: HandlerPart::All,
                    label: None,
                },
            };

            if direction == "SENT" {
                sent_ranges.push(range);
            } else {
                recv_ranges.push(range);
            }
        }
    }

    info!(
        "Built reveal_config from commitments: {} sent ranges, {} recv ranges",
        sent_ranges.len(),
        recv_ranges.len()
    );

    // 7. If commitments were empty, wait for the prover to finish so we have transcript sizes,
    //    then fill in the fallback reveal_config ranges.
    let (sent_transcript, recv_transcript) = if sent_ranges.is_empty() && recv_ranges.is_empty() {
        // Fallback: prover must complete before we can build reveal_config
        let prover_result = tokio::time::timeout(Duration::from_secs(30), prover_handle)
            .await
            .expect("Prover timed out after transcript_ready (fallback)")
            .expect("Prover task panicked");
        let (s, r) = prover_result.expect("Prover execution failed");
        info!(
            "Prover completed (fallback path): sent={} bytes, recv={} bytes",
            s.len(),
            r.len()
        );

        // Build full-transcript reveal ranges
        if s.len() > 0 {
            sent_ranges.push(RangeWithHandler {
                start: 0,
                end: s.len(),
                handler: Handler {
                    handler_type: HandlerType::Sent,
                    part: HandlerPart::All,
                    label: None,
                },
            });
        }
        if r.len() > 0 {
            recv_ranges.push(RangeWithHandler {
                start: 0,
                end: r.len(),
                handler: Handler {
                    handler_type: HandlerType::Recv,
                    part: HandlerPart::All,
                    label: None,
                },
            });
        }
        info!(
            "Fallback reveal_config: {} sent ranges, {} recv ranges",
            sent_ranges.len(),
            recv_ranges.len()
        );
        (s, r)
    } else {
        // Primary path: prover should already be done, just collect its result
        let prover_result = tokio::time::timeout(Duration::from_secs(30), prover_handle)
            .await
            .expect("Prover timed out")
            .expect("Prover task panicked");
        let (s, r) = prover_result.expect("Prover execution failed");
        info!(
            "Prover completed: sent={} bytes, recv={} bytes",
            s.len(),
            r.len()
        );
        (s, r)
    };

    // 8. Send reveal_config (ranges derived from commitment boundaries or full transcript)
    session
        .send_reveal_config(sent_ranges, recv_ranges)
        .await
        .expect("Failed to send reveal config");

    // 9. Wait for session completion (server processes reveal_config and returns results)
    let results = tokio::time::timeout(Duration::from_secs(30), session.wait_for_completion())
        .await
        .expect("Session completion timed out")
        .expect("Session did not complete successfully");

    info!("Session completed with {} results", results.len());

    // 10. Verify results contain expected data
    assert!(!results.is_empty(), "Should have handler results");

    // Check that response contains expected JSON data
    let recv_str = String::from_utf8_lossy(&recv_transcript);
    assert!(
        recv_str.contains("software engineer") || recv_str.contains("Anytown"),
        "Response should contain expected JSON data: {}",
        &recv_str[..recv_str.len().min(500)]
    );

    // 11. Wait for webhook delivery
    tokio::time::sleep(Duration::from_secs(2)).await;

    // 12. Verify slim webhook was received (SlimWebhookPayload format)
    let payloads = webhook_server.get_payloads().await;
    assert_eq!(
        payloads.len(),
        1,
        "Should have received exactly one webhook"
    );

    let payload = &payloads[0];

    // Verify SlimWebhookPayload structure (R.16 / Travel Rule)

    // attestationId must equal the session_id returned by /session at registration time
    assert!(
        payload["attestationId"].is_string(),
        "attestationId should be a string"
    );
    assert_eq!(
        payload["attestationId"].as_str().unwrap_or(""),
        session_id.as_str(),
        "attestationId must equal the session_id from the /session registration"
    );

    assert!(
        payload["serverName"].is_string(),
        "serverName should be a string (camelCase)"
    );
    assert_eq!(
        payload["serverName"], "raw.githubusercontent.com",
        "serverName should match"
    );

    // The reveal_config used in this test has no labeled handlers (label: None),
    // so the Travel Rule fields map must be empty.
    let travel_rule_fields = payload["travelRuleFields"]
        .as_object()
        .expect("travelRuleFields must be a JSON object");
    assert!(
        travel_rule_fields.is_empty(),
        "no labeled handlers were submitted, so travelRuleFields must be empty, got: {:?}",
        travel_rule_fields
    );

    assert!(
        payload["accountChecksAllPassed"].is_boolean(),
        "accountChecksAllPassed should be a boolean"
    );
    assert!(
        payload["timestamp"].is_string(),
        "timestamp should be a string"
    );

    // Confirm old fat-payload fields are NOT present
    assert!(
        payload.get("results").is_none(),
        "Slim payload must NOT contain 'results' (old WebhookPayload field)"
    );
    assert!(
        payload.get("config").is_none(),
        "Slim payload must NOT contain 'config' (old WebhookPayload field)"
    );
    assert!(
        payload.get("transcript").is_none(),
        "Slim payload must NOT contain 'transcript' (old WebhookPayload field)"
    );
    assert!(
        payload.get("session").is_none(),
        "Slim payload must NOT contain 'session' (old WebhookPayload field)"
    );

    info!("All webhook assertions passed!");

    // 13. Cleanup
    webhook_server.shutdown().await;
    verifier_handle.abort();

    info!("Integration test completed successfully!");
}

/// Verifies that the `/proof/:session_id` and `/proof?txHash=` routes return
/// HTTP 404 for unknown identifiers, and that the routing layer is wired up
/// correctly.
///
/// This test only exercises the 404 path.  The success paths (200 on GET,
/// 200 on PATCH, and the subsequent GET reflecting the new txHash) are covered
/// by `test_proof_store_api_success_paths`.
#[tokio::test]
async fn test_proof_store_api() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    let verifier_handle = start_verifier_server(WEBHOOK_PORT + 4, VERIFIER_PORT + 4).await;
    tokio::time::sleep(Duration::from_millis(200)).await;

    // We cannot easily seed the in-memory DB from outside the Arc<Mutex<Connection>>
    // without a test-only endpoint. Instead, verify the 404 path and the endpoint
    // routing are functioning — the full proof-write path is covered by unit_test.rs.
    let client = reqwest::Client::new();

    // 404 for unknown session
    let resp = client
        .get(format!(
            "http://127.0.0.1:{}/proof/does-not-exist",
            VERIFIER_PORT + 4
        ))
        .send()
        .await
        .expect("Failed to send GET");
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);

    // 404 for unknown but valid-format tx hash via GET /proof?txHash=
    let resp = client
        .get(format!(
            "http://127.0.0.1:{}/proof?txHash=0xdeadbeef",
            VERIFIER_PORT + 4
        ))
        .send()
        .await
        .expect("Failed to send GET by txHash");
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);

    verifier_handle.abort();
}

/// Test success paths for the proof store API:
/// GET /proof/:id (200), PATCH /proof/:id/tx (200), GET /proof?txHash= (200), unknown PATCH (404).
#[tokio::test]
async fn test_proof_store_api_success_paths() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    let verifier_handle = start_verifier_server(WEBHOOK_PORT + 5, VERIFIER_PORT + 5).await;
    tokio::time::sleep(Duration::from_millis(200)).await;

    let client = reqwest::Client::new();
    let base = format!("http://127.0.0.1:{}", VERIFIER_PORT + 5);
    let session_id = "test-success-session-abc123";

    // 1. Seed a record via the test-only POST /test/seed endpoint
    let seed_body = serde_json::json!({
        "session_id": session_id,
        "server_name": "wise.com",
        "policy_version": "v1.0.0",
        "order_binding_hash": "0xdeadbeef",
        "commitments_hash": "0xcafebabe",
        "verifier_signature": "0xsig",
        "verifier_address": "0xaddr",
        "handler_results": "[]",
        "account_checks": null,
        "redacted_sent": "GET / HTTP/1.1\r\n",
        "redacted_recv": "HTTP/1.1 200 OK\r\n",
        "session_data": null,
        "tx_hash": null,
        "recorded_at": "2026-01-01T00:00:00Z",
        "retain_until": "2027-01-01T00:00:00Z",
        "transcript_commitments": null,
        "signing_chain_id": null
    });
    let seed_resp = client
        .post(format!("{}/test/seed", base))
        .json(&seed_body)
        .send()
        .await
        .expect("Failed to seed record");
    assert_eq!(seed_resp.status(), StatusCode::CREATED);

    // 2. GET /proof/:session_id returns 200 and session_id matches
    let get_resp = client
        .get(format!("{}/proof/{}", base, session_id))
        .send()
        .await
        .expect("Failed GET /proof/:id");
    assert_eq!(get_resp.status(), StatusCode::OK);
    let body: serde_json::Value = get_resp.json().await.expect("Failed to parse JSON");
    assert_eq!(body["attestationId"].as_str().unwrap_or(""), session_id);

    // 3. tx_hash should be null before PATCH
    assert!(body["txHash"].is_null());

    // 4. PATCH /proof/:session_id/tx with txHash + chainId returns 200
    let patch_resp = client
        .patch(format!("{}/proof/{}/tx", base, session_id))
        .json(&serde_json::json!({ "txHash": "0xabcdef", "chainId": 11155111 }))
        .send()
        .await
        .expect("Failed PATCH /proof/:id/tx");
    assert_eq!(patch_resp.status(), StatusCode::OK);

    // 5. GET /proof/:session_id now shows the tx_hash
    let get_resp2 = client
        .get(format!("{}/proof/{}", base, session_id))
        .send()
        .await
        .expect("Failed GET /proof/:id after PATCH");
    assert_eq!(get_resp2.status(), StatusCode::OK);
    let body2: serde_json::Value = get_resp2.json().await.expect("Failed to parse JSON");
    assert_eq!(body2["txHash"].as_str().unwrap_or(""), "0xabcdef");

    // 6. GET /proof?txHash=0xabcdef returns 200 and session_id matches
    let by_tx_resp = client
        .get(format!("{}/proof?txHash=0xabcdef", base))
        .send()
        .await
        .expect("Failed GET /proof?txHash=");
    assert_eq!(by_tx_resp.status(), StatusCode::OK);
    let body3: serde_json::Value = by_tx_resp.json().await.expect("Failed to parse JSON");
    assert_eq!(body3["attestationId"].as_str().unwrap_or(""), session_id);

    // 7. PATCH for unknown session returns 404
    let unknown_patch = client
        .patch(format!("{}/proof/nonexistent-session/tx", base))
        .json(&serde_json::json!({ "txHash": "0x999" }))
        .send()
        .await
        .expect("Failed PATCH unknown");
    assert_eq!(unknown_patch.status(), StatusCode::NOT_FOUND);

    verifier_handle.abort();
}

// ============================================================================
// Phase D helpers and tests — 401 / 400 / 409 paths
// ============================================================================

/// Start a verifier server with a specific `proof_api_key` for auth tests.
async fn start_verifier_server_with_key(verifier_port: u16, key: &str) -> JoinHandle<()> {
    let config_yaml = r#"webhooks: {}"#;
    let config: crate::Config = serde_yaml::from_str(config_yaml).unwrap();
    let conn = crate::init_db(":memory:");
    let db = Arc::new(std::sync::Mutex::new(conn));

    let app_state = Arc::new(crate::AppState {
        sessions: Arc::new(Mutex::new(HashMap::new())),
        config: Arc::new(config),
        db,
        proof_api_key: Some(key.to_string()),
        ws_rate_limiter: Arc::new(std::sync::Mutex::new(HashMap::new())),
    });

    let app = axum::Router::new()
        .route("/health", axum::routing::get(|| async { "ok" }))
        .route("/proof/:session_id", axum::routing::get(crate::get_proof_handler))
        .route("/proof/:session_id/tx", axum::routing::patch(crate::patch_proof_tx_handler))
        .route("/proof", axum::routing::get(crate::get_proof_by_tx_handler))
        .route("/test/seed", axum::routing::post(crate::test_seed_proof_handler))
        .layer(CorsLayer::permissive())
        .with_state(app_state);

    let addr = SocketAddr::from(([127, 0, 0, 1], verifier_port));
    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
        axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await.unwrap();
    })
}

/// D-2/D-3/D-4: Auth required — 401 without key, 401 with wrong key, 404 with correct key.
#[tokio::test]
async fn test_proof_api_auth_required() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    const PORT: u16 = VERIFIER_PORT + 6;
    let verifier_handle = start_verifier_server_with_key(PORT, "test-secret").await;
    tokio::time::sleep(Duration::from_millis(200)).await;

    let client = reqwest::Client::new();
    let base = format!("http://127.0.0.1:{}", PORT);

    // D-2: no key header → 401
    let resp = client
        .get(format!("{}/proof/any-id", base))
        .send()
        .await
        .expect("Failed request");
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED, "missing key should be 401");

    // D-3: wrong key → 401
    let resp = client
        .get(format!("{}/proof/any-id", base))
        .header("X-TLSN-Api-Key", "wrong-key")
        .send()
        .await
        .expect("Failed request");
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED, "wrong key should be 401");

    // D-4: correct key → auth passes, 404 because no record seeded
    let resp = client
        .get(format!("{}/proof/any-id", base))
        .header("X-TLSN-Api-Key", "test-secret")
        .send()
        .await
        .expect("Failed request");
    assert_eq!(resp.status(), StatusCode::NOT_FOUND, "correct key but unknown id should be 404");

    // Bearer form also accepted
    let resp = client
        .get(format!("{}/proof/any-id", base))
        .header("authorization", "Bearer test-secret")
        .send()
        .await
        .expect("Failed request");
    assert_eq!(resp.status(), StatusCode::NOT_FOUND, "Bearer token form should also pass auth");

    verifier_handle.abort();
}

/// D-5: Invalid PATCH inputs return 400.
#[tokio::test]
async fn test_patch_tx_invalid_inputs() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    const PORT: u16 = VERIFIER_PORT + 7;
    // Dev-mode server (no API key) so auth does not interfere with input validation tests.
    let verifier_handle = start_verifier_server(WEBHOOK_PORT + 7, PORT).await;
    tokio::time::sleep(Duration::from_millis(200)).await;

    let client = reqwest::Client::new();
    let base = format!("http://127.0.0.1:{}", PORT);

    // Seed a record so the session exists (validates that 400 fires before DB lookup).
    let seed_body = serde_json::json!({
        "session_id": "seed-for-input-validation",
        "server_name": "wise.com",
        "policy_version": "v1.0.0",
        "order_binding_hash": "0xdeadbeef",
        "commitments_hash": "0xcafebabe",
        "verifier_signature": "0xsig",
        "verifier_address": "0xaddr",
        "handler_results": "[]",
        "account_checks": null,
        "redacted_sent": "GET / HTTP/1.1\r\n",
        "redacted_recv": "HTTP/1.1 200 OK\r\n",
        "session_data": null,
        "tx_hash": null,
        "recorded_at": "2026-01-01T00:00:00Z",
        "retain_until": "2027-01-01T00:00:00Z",
        "transcript_commitments": null,
        "signing_chain_id": null
    });
    let seed_resp = client.post(format!("{}/test/seed", base)).json(&seed_body).send().await.unwrap();
    assert_eq!(seed_resp.status(), StatusCode::CREATED);

    let url = format!("{}/proof/seed-for-input-validation/tx", base);

    // Case 1: txHash without 0x prefix → 400
    let resp = client
        .patch(&url)
        .json(&serde_json::json!({ "txHash": "not-a-hash" }))
        .send()
        .await
        .expect("Failed PATCH");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST, "non-hex txHash should be 400");

    // Case 2: 0x prefix but invalid hex chars → 400
    let resp = client
        .patch(&url)
        .json(&serde_json::json!({ "txHash": "0xinvalid!!!" }))
        .send()
        .await
        .expect("Failed PATCH");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST, "0x + invalid chars should be 400");

    // Case 3: valid txHash but negative chainId → 400
    let resp = client
        .patch(&url)
        .json(&serde_json::json!({ "txHash": "0xabc123", "chainId": -1 }))
        .send()
        .await
        .expect("Failed PATCH");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST, "negative chainId should be 400");

    verifier_handle.abort();
}

/// D-6: Second PATCH on same session returns 409; first PATCH value is preserved.
#[tokio::test]
async fn test_patch_tx_no_overwrite() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    const PORT: u16 = VERIFIER_PORT + 8;
    let verifier_handle = start_verifier_server(WEBHOOK_PORT + 8, PORT).await;
    tokio::time::sleep(Duration::from_millis(200)).await;

    let client = reqwest::Client::new();
    let base = format!("http://127.0.0.1:{}", PORT);
    let session_id = "no-overwrite-session";

    // Seed a record.
    let seed_body = serde_json::json!({
        "session_id": session_id,
        "server_name": "wise.com",
        "policy_version": "v1.0.0",
        "order_binding_hash": "0xdeadbeef",
        "commitments_hash": "0xcafebabe",
        "verifier_signature": "0xsig",
        "verifier_address": "0xaddr",
        "handler_results": "[]",
        "account_checks": null,
        "redacted_sent": "GET / HTTP/1.1\r\n",
        "redacted_recv": "HTTP/1.1 200 OK\r\n",
        "session_data": null,
        "tx_hash": null,
        "recorded_at": "2026-01-01T00:00:00Z",
        "retain_until": "2027-01-01T00:00:00Z",
        "transcript_commitments": null,
        "signing_chain_id": null
    });
    client.post(format!("{}/test/seed", base)).json(&seed_body).send().await.unwrap();

    let url = format!("{}/proof/{}/tx", base, session_id);

    // Step 1: first PATCH → 200
    let resp = client
        .patch(&url)
        .json(&serde_json::json!({ "txHash": "0xabc111", "chainId": 11155111 }))
        .send()
        .await
        .expect("Failed first PATCH");
    assert_eq!(resp.status(), StatusCode::OK, "first PATCH should be 200");

    // Step 2: second PATCH with a different hash → 409
    let resp = client
        .patch(&url)
        .json(&serde_json::json!({ "txHash": "0xabc222", "chainId": 11155111 }))
        .send()
        .await
        .expect("Failed second PATCH");
    assert_eq!(resp.status(), StatusCode::CONFLICT, "second PATCH should be 409");

    // Step 3: GET /proof/:id → txHash is still the first value
    let resp = client
        .get(format!("{}/proof/{}", base, session_id))
        .send()
        .await
        .expect("Failed GET after double PATCH");
    assert_eq!(resp.status(), StatusCode::OK);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["txHash"].as_str().unwrap_or(""), "0xabc111", "txHash must not be overwritten");

    verifier_handle.abort();
}

/// D-7: GET /proof?txHash= with invalid format returns 400.
#[tokio::test]
async fn test_get_proof_by_tx_invalid_format() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    const PORT: u16 = VERIFIER_PORT + 9;
    let verifier_handle = start_verifier_server(WEBHOOK_PORT + 9, PORT).await;
    tokio::time::sleep(Duration::from_millis(200)).await;

    let client = reqwest::Client::new();
    let base = format!("http://127.0.0.1:{}", PORT);

    // Non-hex value → 400
    let resp = client
        .get(format!("{}/proof?txHash=not-a-valid-hash", base))
        .send()
        .await
        .expect("Failed GET");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST, "invalid txHash format should be 400");

    // Valid 0x prefix but illegal chars → 400
    let resp = client
        .get(format!("{}/proof?txHash=0xbad!!!", base))
        .send()
        .await
        .expect("Failed GET");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST, "0x + invalid chars should be 400");

    verifier_handle.abort();
}

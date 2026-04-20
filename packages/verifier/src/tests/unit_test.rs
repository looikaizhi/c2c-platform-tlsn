use crate::{
    build_slim_webhook_payload, compute_hmac_sha256, current_timestamp_str, init_db,
    insert_proof_record, get_proof_by_session_id, get_proof_by_tx_hash, patch_tx_hash,
    retain_until_str, Handler, HandlerPart, HandlerResult, HandlerType, ProofExportRecord,
    VerifierSignature,
};

// ============================================================================
// HMAC-SHA256 tests (R.11 webhook security)
// ============================================================================

#[test]
fn test_hmac_sha256_deterministic() {
    let secret = "my-secret-key";
    let body = r#"{"attestationId":"test-123"}"#;
    let hex1 = compute_hmac_sha256(secret, body);
    let hex2 = compute_hmac_sha256(secret, body);
    assert_eq!(hex1, hex2, "HMAC must be deterministic");
    assert_eq!(hex1.len(), 64, "HMAC-SHA256 hex should be 64 characters");
    // Only lowercase hex chars
    assert!(hex1.chars().all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()));
}

#[test]
fn test_hmac_sha256_different_secrets_produce_different_macs() {
    let body = r#"{"attestationId":"test-123"}"#;
    let hex1 = compute_hmac_sha256("secret-a", body);
    let hex2 = compute_hmac_sha256("secret-b", body);
    assert_ne!(hex1, hex2, "Different secrets must produce different MACs");
}

#[test]
fn test_hmac_sha256_different_bodies_produce_different_macs() {
    let secret = "shared-secret";
    let hex1 = compute_hmac_sha256(secret, r#"{"attestationId":"session-1"}"#);
    let hex2 = compute_hmac_sha256(secret, r#"{"attestationId":"session-2"}"#);
    assert_ne!(hex1, hex2, "Different bodies must produce different MACs");
}

// ============================================================================
// SQLite persistence tests (R.11 proof store)
// ============================================================================

fn make_test_record(session_id: &str) -> ProofExportRecord {
    ProofExportRecord {
        session_id: session_id.to_string(),
        server_name: "wise.com".to_string(),
        policy_version: Some("v1.0.0".to_string()),
        order_binding_hash: Some("0xdeadbeef".to_string()),
        commitments_hash: "0xcafebabe".to_string(),
        verifier_signature: Some("0xsig".to_string()),
        verifier_address: Some("0xaddr".to_string()),
        handler_results: r#"[]"#.to_string(),
        account_checks: None,
        redacted_sent: Some("GET / HTTP/1.1\r\n".to_string()),
        redacted_recv: Some("HTTP/1.1 200 OK\r\n".to_string()),
        session_data: Some(r#"{"__tlsn_policy_version":"v1.0.0"}"#.to_string()),
        tx_hash: None,
        recorded_at: current_timestamp_str(),
        retain_until: retain_until_str(),
    }
}

#[test]
fn test_sqlite_insert_and_retrieve_by_session_id() {
    let conn = init_db(":memory:");
    let record = make_test_record("test-session-1");
    insert_proof_record(&conn, &record);

    let retrieved = get_proof_by_session_id(&conn, "test-session-1");
    assert!(retrieved.is_some(), "Should retrieve inserted record");
    let r = retrieved.unwrap();
    assert_eq!(r.session_id, "test-session-1");
    assert_eq!(r.server_name, "wise.com");
    assert_eq!(r.policy_version, Some("v1.0.0".to_string()));
    assert_eq!(r.tx_hash, None);
}

#[test]
fn test_sqlite_returns_none_for_missing_session() {
    let conn = init_db(":memory:");
    let retrieved = get_proof_by_session_id(&conn, "nonexistent-session");
    assert!(retrieved.is_none(), "Should return None for missing session");
}

#[test]
fn test_sqlite_patch_tx_hash() {
    let conn = init_db(":memory:");
    let record = make_test_record("test-session-tx");
    insert_proof_record(&conn, &record);

    patch_tx_hash(&conn, "test-session-tx", "0xabc123", Some(11155111));

    let retrieved = get_proof_by_session_id(&conn, "test-session-tx");
    assert!(retrieved.is_some());
    assert_eq!(retrieved.unwrap().tx_hash, Some("0xabc123".to_string()));
}

#[test]
fn test_sqlite_get_by_tx_hash() {
    let conn = init_db(":memory:");
    let record = make_test_record("test-session-lookup");
    insert_proof_record(&conn, &record);
    patch_tx_hash(&conn, "test-session-lookup", "0xunique-tx", None);

    let retrieved = get_proof_by_tx_hash(&conn, "0xunique-tx");
    assert!(retrieved.is_some(), "Should find record by tx hash");
    assert_eq!(retrieved.unwrap().session_id, "test-session-lookup");
}

#[test]
fn test_sqlite_get_by_tx_hash_returns_none_if_not_set() {
    let conn = init_db(":memory:");
    let record = make_test_record("test-session-notx");
    insert_proof_record(&conn, &record);

    let retrieved = get_proof_by_tx_hash(&conn, "0xmissing");
    assert!(retrieved.is_none(), "Should return None when tx_hash is not set");
}

#[test]
fn test_sqlite_insert_or_replace() {
    let conn = init_db(":memory:");
    let record = make_test_record("test-session-replace");
    insert_proof_record(&conn, &record);

    // Insert same session_id with different policy_version
    let updated = ProofExportRecord {
        policy_version: Some("v2.0.0".to_string()),
        ..make_test_record("test-session-replace")
    };
    insert_proof_record(&conn, &updated);

    let retrieved = get_proof_by_session_id(&conn, "test-session-replace");
    assert!(retrieved.is_some());
    assert_eq!(retrieved.unwrap().policy_version, Some("v2.0.0".to_string()),
        "INSERT OR REPLACE should overwrite existing record");
}

// ============================================================================
// Label propagation tests (T13 / R.16)
// ============================================================================

fn make_handler_result(label: Option<&str>, value: &str, idx: usize) -> HandlerResult {
    HandlerResult {
        commitment_index: idx,
        handler: Handler {
            handler_type: HandlerType::Recv,
            part: HandlerPart::Body,
            label: label.map(|s| s.to_string()),
        },
        value: value.to_string(),
        start: 0,
        end: value.len(),
    }
}

#[test]
fn test_build_slim_webhook_payload_travel_rule_fields() {
    let results = vec![
        make_handler_result(Some("originator.amount"), "100.00", 0),
        make_handler_result(Some("transaction.id"), "TXN-001", 1),
        make_handler_result(None, "unlabeled", 2),
    ];

    let sig: Option<VerifierSignature> = None;
    let payload = build_slim_webhook_payload(
        "session-abc",
        Some("v1.0.0".to_string()),
        "wise.com",
        &results,
        true,
        &sig,
        None,
    );

    assert_eq!(payload.attestation_id, "session-abc");
    assert_eq!(payload.policy_version, Some("v1.0.0".to_string()));
    assert_eq!(payload.travel_rule_fields.len(), 2, "Only labeled handlers go into travel_rule_fields");
    assert!(payload.travel_rule_fields.contains_key("originator.amount"));
    assert_eq!(payload.travel_rule_fields["originator.amount"].value, "100.00");
    assert_eq!(payload.travel_rule_fields["originator.amount"].commitment_index, 0);
    assert!(payload.travel_rule_fields.contains_key("transaction.id"));
    assert!(!payload.travel_rule_fields.contains_key("unlabeled"),
        "Handlers without label must not appear in travel_rule_fields");
}

#[test]
fn test_build_slim_webhook_payload_no_labels_produces_empty_map() {
    let results = vec![
        make_handler_result(None, "data1", 0),
        make_handler_result(None, "data2", 1),
    ];
    let sig: Option<VerifierSignature> = None;
    let payload = build_slim_webhook_payload(
        "session-nolabel",
        None,
        "api.example.com",
        &results,
        true,
        &sig,
        None,
    );
    assert!(payload.travel_rule_fields.is_empty(),
        "No labels → travel_rule_fields should be empty");
}

// ============================================================================
// policyVersion in sign_commitments (T12 / R.15)
// ============================================================================

#[test]
fn test_sign_commitments_includes_policy_version() {
    use crate::{sign_commitments, TranscriptCommitmentSummary};
    use k256::ecdsa::SigningKey;

    // Generate a test signing key (not for production use)
    let key_bytes = [1u8; 32];
    let signing_key = SigningKey::from_slice(&key_bytes).expect("valid test key");

    let commitments: Vec<TranscriptCommitmentSummary> = vec![];
    let sig_with_pv = sign_commitments(
        &signing_key,
        11155111,
        "test-session",
        &commitments,
        None,
        Some("v1.0.0"),
    ).expect("signing should succeed");

    let sig_no_pv = sign_commitments(
        &signing_key,
        11155111,
        "test-session",
        &commitments,
        None,
        None,
    ).expect("signing should succeed");

    assert_eq!(sig_with_pv.policy_version, Some("v1.0.0".to_string()));
    assert_eq!(sig_no_pv.policy_version, None);
    assert_ne!(sig_with_pv.signature, sig_no_pv.signature,
        "Different policyVersion must produce different signatures");
}

#[test]
fn test_sign_commitments_same_policy_version_is_deterministic() {
    use crate::{sign_commitments, TranscriptCommitmentSummary};
    use k256::ecdsa::SigningKey;

    let key_bytes = [2u8; 32];
    let signing_key = SigningKey::from_slice(&key_bytes).expect("valid test key");
    let commitments: Vec<TranscriptCommitmentSummary> = vec![];

    let sig1 = sign_commitments(&signing_key, 1, "sess", &commitments, None, Some("v1.0.0"))
        .expect("signing should succeed");
    let sig2 = sign_commitments(&signing_key, 1, "sess", &commitments, None, Some("v1.0.0"))
        .expect("signing should succeed");

    assert_eq!(sig1.signature, sig2.signature,
        "Same inputs must produce same signature (deterministic ECDSA)");
}

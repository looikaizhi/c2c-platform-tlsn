use crate::{
    build_slim_webhook_payload, compute_hmac_sha256, current_timestamp_str, format_rfc3339,
    init_db, insert_proof_record, get_proof_by_session_id, get_proof_by_tx_hash, patch_tx_hash,
    record_to_response, retain_until_str, Handler, HandlerPart, HandlerResult, HandlerType,
    ProofExportRecord, VerifierSignature,
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
        transcript_commitments: None,
        signing_chain_id: None,
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

    let rows = patch_tx_hash(&conn, "test-session-tx", "0xabc123", Some(11155111))
        .expect("patch_tx_hash should not return a DB error");
    assert_eq!(rows, 1, "Should have updated exactly 1 row");

    let retrieved = get_proof_by_session_id(&conn, "test-session-tx");
    assert!(retrieved.is_some());
    assert_eq!(retrieved.unwrap().tx_hash, Some("0xabc123".to_string()));
}

#[test]
fn test_patch_tx_hash_unknown_session_returns_zero_rows() {
    let conn = init_db(":memory:");
    // No record inserted — session_id does not exist.
    let rows = patch_tx_hash(&conn, "nonexistent-session", "0xdeadbeef", None)
        .expect("patch_tx_hash should not return a DB error for missing session");
    assert_eq!(rows, 0, "Should return 0 rows affected when session_id is not found");
}

#[test]
fn test_sqlite_get_by_tx_hash() {
    let conn = init_db(":memory:");
    let record = make_test_record("test-session-lookup");
    insert_proof_record(&conn, &record);
    patch_tx_hash(&conn, "test-session-lookup", "0xunique-tx", None)
        .expect("patch_tx_hash should succeed");

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

// ============================================================================
// Compliance full-path regression tests (Groups 1–6)
// ============================================================================

// Group 1: account_checks persisted and retrieved
#[test]
fn test_account_checks_persisted_and_retrieved() {
    let conn = init_db(":memory:");
    let account_checks_json = r#"[
        {"direction":"recv","start":100,"end":150,
         "expectedHash":"0xabc","computedHash":"0xabc",
         "valueMode":"json_value","passed":true,"fieldLabel":"originator.accountId"}
    ]"#;
    let mut record = make_test_record("session-checks");
    record.account_checks = Some(account_checks_json.to_string());
    insert_proof_record(&conn, &record);

    let retrieved = get_proof_by_session_id(&conn, "session-checks").unwrap();
    assert!(retrieved.account_checks.is_some());
    let parsed: serde_json::Value =
        serde_json::from_str(retrieved.account_checks.unwrap().as_str()).unwrap();
    assert_eq!(parsed[0]["passed"], true);
    assert_eq!(parsed[0]["fieldLabel"], "originator.accountId");
}

// Group 2: transcript_commitments persisted and retrieved
#[test]
fn test_transcript_commitments_persisted_and_retrieved() {
    let conn = init_db(":memory:");
    let tc_json = r#"[{"commitmentIndex":0,"hashHex":"0xcafe","start":0,"end":10}]"#;
    let mut record = make_test_record("session-tc");
    record.transcript_commitments = Some(tc_json.to_string());
    insert_proof_record(&conn, &record);

    let retrieved = get_proof_by_session_id(&conn, "session-tc").unwrap();
    assert!(retrieved.transcript_commitments.is_some());
    let parsed: serde_json::Value =
        serde_json::from_str(retrieved.transcript_commitments.unwrap().as_str()).unwrap();
    assert_eq!(parsed[0]["hashHex"], "0xcafe");
}

// Group 3: signing_chain_id persisted and retrieved
#[test]
fn test_signing_chain_id_persisted_and_retrieved() {
    let conn = init_db(":memory:");
    let mut record = make_test_record("session-chainid");
    record.signing_chain_id = Some(11155111);
    insert_proof_record(&conn, &record);

    let retrieved = get_proof_by_session_id(&conn, "session-chainid").unwrap();
    assert_eq!(retrieved.signing_chain_id, Some(11155111));
}

// Group 4: record_to_response produces ProofExportV1-aligned structure
#[test]
fn test_record_to_response_travel_rule_fields() {
    let conn = init_db(":memory:");
    let handler_results = r#"[
        {"commitmentIndex":0,"type":"RECV","part":"BODY",
         "label":"originator.amount","value":"100.00","start":0,"end":6},
        {"commitmentIndex":1,"type":"RECV","part":"BODY",
         "value":"no-label","start":6,"end":14}
    ]"#;
    let mut record = make_test_record("session-trf");
    record.handler_results = handler_results.to_string();
    insert_proof_record(&conn, &record);

    let retrieved = get_proof_by_session_id(&conn, "session-trf").unwrap();
    let response = record_to_response(retrieved);

    assert_eq!(response.format_version, "ProofExportV1");
    let trf = &response.travel_rule_fields;
    assert!(trf.get("originator.amount").is_some(), "labeled handler must appear");
    assert!(trf.get("no-label").is_none(), "handler without label must not appear");
}

#[test]
fn test_record_to_response_has_required_v1_fields() {
    let record = make_test_record("session-v1");
    let response = record_to_response(record);
    assert_eq!(response.format_version, "ProofExportV1");
    assert!(response.account_checks.is_array(), "accountChecks must be a JSON array");
    assert!(response.transcript_commitments.is_array(), "transcriptCommitments must be a JSON array");
}

// Group 5: duplicate travel_rule label does not panic
#[test]
fn test_duplicate_label_does_not_panic() {
    let results = vec![
        make_handler_result(Some("originator.amount"), "100.00", 0),
        make_handler_result(Some("originator.amount"), "200.00", 1),
    ];
    let sig: Option<VerifierSignature> = None;
    // Must not panic; duplicate label — last value wins
    let payload = build_slim_webhook_payload(
        "session-dup",
        Some("v1.0.0".to_string()),
        "wise.com",
        &results,
        true,
        &sig,
        None,
    );
    assert_eq!(payload.travel_rule_fields.len(), 1);
    assert_eq!(payload.travel_rule_fields["originator.amount"].value, "200.00");
}

// Group 6: timestamp functions return RFC3339 format

/// Validates that a string is a strict RFC3339 datetime using a regex that
/// checks the structural format beyond the loose `contains('T')` / `ends_with('Z')`
/// heuristics.  Pattern: YYYY-MM-DDTHH:MM:SS followed by Z or ±HH:MM offset.
fn assert_is_rfc3339(s: &str, label: &str) {
    let re = regex::Regex::new(
        r"^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$",
    )
    .expect("RFC3339 regex must compile");
    assert!(
        re.is_match(s),
        "{} must match strict RFC3339 YYYY-MM-DDTHH:MM:SS(Z|±HH:MM), got: {}",
        label,
        s
    );
}

#[test]
fn test_current_timestamp_str_is_rfc3339() {
    let ts = current_timestamp_str();
    assert_is_rfc3339(&ts, "current_timestamp_str()");
}

#[test]
fn test_retain_until_str_is_rfc3339() {
    let ts = retain_until_str();
    assert_is_rfc3339(&ts, "retain_until_str()");
}

#[test]
fn test_format_rfc3339_known_value() {
    // Unix epoch = 1970-01-01T00:00:00Z
    assert_eq!(format_rfc3339(0), "1970-01-01T00:00:00Z");
    // 1745222400 = 2025-04-21T08:00:00Z
    assert_eq!(format_rfc3339(1745222400), "2025-04-21T08:00:00Z");
    // 2024-02-29T11:34:56Z (leap year) = 1709206496
    assert_eq!(format_rfc3339(1709206496), "2024-02-29T11:34:56Z");
}

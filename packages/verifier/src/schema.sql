-- TLSNotary Verifier Proof Store Schema
-- R.11 (FATF): 5-year retention requirement
-- Each row represents one completed verification session.

CREATE TABLE IF NOT EXISTS proof_store (
    session_id         TEXT PRIMARY KEY,
    server_name        TEXT NOT NULL,
    policy_version     TEXT,
    order_binding_hash TEXT,
    commitments_hash   TEXT NOT NULL,
    verifier_signature TEXT,
    verifier_address   TEXT,
    handler_results    TEXT NOT NULL,   -- JSON array of HandlerResult
    account_checks     TEXT,            -- JSON (optional)
    redacted_sent      TEXT,            -- redacted HTTP request transcript
    redacted_recv      TEXT,            -- redacted HTTP response transcript
    session_data       TEXT,            -- JSON of session metadata
    tx_hash            TEXT,            -- on-chain tx hash (written after PATCH)
    recorded_at        TEXT NOT NULL,   -- ISO 8601 UTC timestamp
    retain_until       TEXT NOT NULL    -- recorded_at + 5 years
);

-- Index for reverse lookup by on-chain tx hash
CREATE INDEX IF NOT EXISTS idx_tx_hash ON proof_store(tx_hash);

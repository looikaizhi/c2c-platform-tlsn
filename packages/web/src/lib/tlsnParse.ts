// tlsnParse.ts — extract REVEAL'd payee fields from a TLSN proof transcript.
//
// MVP: this module is a placeholder. The verify-counterparty server endpoint
// accepts disclosed plaintext fields (name + handle) DIRECTLY from the
// frontend, which extracts them from `tlsn.result` (already structured by the
// extension). The chain anchor + DB salt + commit recompute then catches any
// client-lying.
//
// Phase 2 will move the parsing server-side (parse raw transcript bytes against
// REVEAL handler byte-ranges) so the frontend cannot tamper.
//
// Until then, this file just defines the shared DisclosedPayee type used by
// both client extraction helpers and the server endpoint.

export interface DisclosedPayee {
    name: string;
    handle: string;
}

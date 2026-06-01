// Proofs API talks to the EXTERNAL verifier (WebSocket/HTTP), not the internal
// Next.js /api/* routes. The implementation lives in @/lib/proofsApi.
// This module is a thin re-export so consumers can stay within api/resources/.
export * from '@/lib/proofsApi';

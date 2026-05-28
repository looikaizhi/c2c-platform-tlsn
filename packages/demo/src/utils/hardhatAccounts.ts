// Shim — collapsed into chain.ts during Phase 1a. Removed in Phase 7a.
// Legacy aliases `merchantClient` / `buyerClient` are intentionally kept here
// (and NOT re-exported from chain.ts) until Phase 7e — they are only consumed
// by the @deprecated wrappers inside wise/alipay actions, which are removed in
// Phase 7d. The single `import` below is the one allowed exception under §13 C18.
import { merchant1Client, user1Client } from './chain';
export * from './chain';
export const merchantClient = merchant1Client;
export const buyerClient    = user1Client;

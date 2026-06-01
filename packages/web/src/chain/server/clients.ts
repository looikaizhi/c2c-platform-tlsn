import 'server-only';
import { createPublicClient, http, type PublicClient } from 'viem';
import { NETWORK_REGISTRY, DEFAULT_CHAIN_ID } from '@/chain/networkRegistry';

const cache = new Map<number, PublicClient>();

export function getServerPublicClient(chainId: number = DEFAULT_CHAIN_ID): PublicClient {
    const cached = cache.get(chainId);
    if (cached) return cached;
    const network = NETWORK_REGISTRY[chainId];
    if (!network) throw new Error(`Unknown chainId ${chainId}`);
    const rpcUrl = process.env.RPC_URL ?? network.chain.rpcUrls.default.http[0];
    const client = createPublicClient({ chain: network.chain, transport: http(rpcUrl) });
    cache.set(chainId, client);
    return client;
}

import 'server-only';
import type { Address, Hex } from 'viem';
import { getServerPublicClient } from '@/chain/server/clients';
import { DEFAULT_NETWORK } from '@/chain/networkRegistry';

const adminOwnerAbi = [
    {
        type: 'function',
        name: 'admin',
        inputs: [],
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
    },
] as const;

/**
 * Read NEXT_PUBLIC_C2C_ADMIN_ADDRESS at request-time so each request sees the
 * current address even if `.env.local` was updated since the dev server boot.
 * Falls back to `DEFAULT_NETWORK.contracts.c2cAdmin` for safety.
 */
function getC2cAdminAddress(): Hex {
    const fromEnv = process.env.NEXT_PUBLIC_C2C_ADMIN_ADDRESS;
    if (fromEnv && /^0x[a-fA-F0-9]{40}$/.test(fromEnv)) return fromEnv as Hex;
    return DEFAULT_NETWORK.contracts.c2cAdmin;
}

/** Fetch the current C2CAdmin contract's `admin` address. */
export async function getAdminAddress(): Promise<Address> {
    return (await getServerPublicClient().readContract({
        address: getC2cAdminAddress(),
        abi: adminOwnerAbi,
        functionName: 'admin',
    })) as Address;
}

import 'server-only';
import type { Address, Hex } from 'viem';
import {
    extractSignedHeaders,
    verifySignedRequest,
} from '@/lib/walletAuth';
import { findActiveBinding } from '@/server/db/bindingRepo';
import { DEFAULT_NETWORK } from '@/chain/networkRegistry';
import { getServerPublicClient } from '@/chain/server/clients';

/** Read NEXT_PUBLIC_C2C_ADMIN_ADDRESS at request-time. */
function getC2cAdminAddress(): Hex {
    const fromEnv = process.env.NEXT_PUBLIC_C2C_ADMIN_ADDRESS;
    if (fromEnv && /^0x[a-fA-F0-9]{40}$/.test(fromEnv)) return fromEnv as Hex;
    return DEFAULT_NETWORK.contracts.c2cAdmin;
}

const adminReadAbi = [
    {
        type: 'function',
        name: 'getPlatformBinding',
        inputs: [
            { name: '_wallet', type: 'address' },
            { name: '_platformId', type: 'bytes32' },
        ],
        outputs: [
            {
                name: '',
                type: 'tuple',
                components: [
                    { name: 'nameHash', type: 'bytes32' },
                    { name: 'idHash', type: 'bytes32' },
                    { name: 'isSet', type: 'bool' },
                ],
            },
        ],
        stateMutability: 'view',
    },
] as const;

function isHex32(s: unknown): s is Hex {
    return typeof s === 'string' && /^0x[0-9a-fA-F]{64}$/.test(s);
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const platformId = url.searchParams.get('platformId');
    if (!isHex32(platformId)) {
        return Response.json({ error: 'invalid_platform_id' }, { status: 400 });
    }

    let caller;
    try {
        const { signature, timestamp } = extractSignedHeaders(req.headers);
        caller = await verifySignedRequest({
            domain: 'user',
            method: 'GET',
            // include query string so signed message matches client's
            // signApiRequest(path: `/api/binding/onchain-status?platformId=...`)
            path: url.pathname + url.search,
            signature,
            timestamp,
        });
    } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : 'auth_failed';
        return Response.json({ error: reason }, { status: 401 });
    }

    const row = findActiveBinding(caller.wallet, platformId);

    const client = getServerPublicClient();
    let onchain: { nameHash: Hex; idHash: Hex; isSet: boolean };
    try {
        onchain = (await client.readContract({
            address: getC2cAdminAddress(),
            abi: adminReadAbi,
            functionName: 'getPlatformBinding',
            args: [caller.wallet as Address, platformId],
        })) as { nameHash: Hex; idHash: Hex; isSet: boolean };
    } catch (err: unknown) {
        console.error('[binding/onchain-status] rpc read failed', err);
        return Response.json({ error: 'rpc_failed' }, { status: 502 });
    }

    const dbCommit = row
        ? { nameCommit: row.nameCommit, idCommit: row.idCommit }
        : null;
    const inSync =
        !!row &&
        onchain.isSet &&
        onchain.nameHash.toLowerCase() === row.nameCommit.toLowerCase() &&
        onchain.idHash.toLowerCase() === row.idCommit.toLowerCase();

    return Response.json({
        inSync,
        db: dbCommit,
        onchain: {
            nameHash: onchain.nameHash,
            idHash: onchain.idHash,
            isSet: onchain.isSet,
        },
    });
}

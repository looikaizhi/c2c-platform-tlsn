import 'server-only';
import { asc } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { supportCryptoAssets, type SupportCryptoAsset } from '@/server/db/schema';
import { listHandler, insertHandler } from '@/server/handlers/crudHandler';
import type { SyncCryptoRequest } from '@/server/db_types';

export const GET = listHandler<SupportCryptoAsset, {
    id:            number;
    crypto_id:     number;
    token_symbol:  string;
    token_address: string;
    is_active:     boolean;
    edit_time:     string;
    created_time:  string;
}>({
    fetch: () => getDb()
        .select()
        .from(supportCryptoAssets)
        .orderBy(asc(supportCryptoAssets.cryptoId))
        .all(),
    map: (r) => ({
        id:            r.id,
        crypto_id:     r.cryptoId,
        token_symbol:  r.tokenSymbol,
        token_address: r.tokenAddress,
        is_active:     r.isActive,
        edit_time:     new Date(r.editTime * 1000).toISOString(),
        created_time:  new Date(r.createdTime * 1000).toISOString(),
    }),
    tag: 'admin/crypto GET',
});

export const POST = insertHandler<SyncCryptoRequest>({
    validate: (b) =>
        (b.crypto_id === undefined || !b.token_symbol || !b.token_address)
            ? 'Missing required fields' : null,
    insert: (b) => {
        const ts = Math.floor(Date.now() / 1000);
        getDb().insert(supportCryptoAssets).values({
            cryptoId:     b.crypto_id,
            tokenSymbol:  b.token_symbol,
            tokenAddress: b.token_address,
            isActive:     !!b.is_active,
            editTime:     ts,
            createdTime:  ts,
        }).run();
    },
    tag: 'admin/crypto POST',
});

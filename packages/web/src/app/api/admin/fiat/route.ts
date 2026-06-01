import 'server-only';
import { asc } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { supportFiatAssets, type SupportFiatAsset } from '@/server/db/schema';
import { listHandler, insertHandler } from '@/server/handlers/crudHandler';
import type { SyncFiatRequest } from '@/server/db_types';

export const GET = listHandler<SupportFiatAsset, {
    id:           number;
    fiat_id:      number;
    fiat_name:    string;
    is_active:    boolean;
    edit_time:    string;
    created_time: string;
}>({
    fetch: () => getDb()
        .select()
        .from(supportFiatAssets)
        .orderBy(asc(supportFiatAssets.fiatId))
        .all(),
    map: (r) => ({
        id:           r.id,
        fiat_id:      r.fiatId,
        fiat_name:    r.fiatName,
        is_active:    r.isActive,
        edit_time:    new Date(r.editTime * 1000).toISOString(),
        created_time: new Date(r.createdTime * 1000).toISOString(),
    }),
    tag: 'admin/fiat GET',
});

export const POST = insertHandler<SyncFiatRequest>({
    validate: (b) =>
        (b.fiat_id === undefined || !b.fiat_name)
            ? 'Missing required fields' : null,
    insert: (b) => {
        const ts = Math.floor(Date.now() / 1000);
        getDb().insert(supportFiatAssets).values({
            fiatId:      b.fiat_id,
            fiatName:    b.fiat_name,
            isActive:    !!b.is_active,
            editTime:    ts,
            createdTime: ts,
        }).run();
    },
    tag: 'admin/fiat POST',
});

import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { supportCryptoAssets } from '@/server/db/schema';
import { patchByIdHandler } from '@/server/handlers/crudHandler';
import type { UpdateAssetStatusRequest } from '@/server/db_types';

export const PATCH = patchByIdHandler<UpdateAssetStatusRequest>({
    parseId:  (raw) => { const n = parseInt(raw, 10); return Number.isFinite(n) ? n : null; },
    validate: (b) => b.is_active === undefined ? 'Missing is_active' : null,
    update:   (cryptoId, b) => getDb()
        .update(supportCryptoAssets)
        .set({ isActive: !!b.is_active, editTime: Math.floor(Date.now() / 1000) })
        .where(eq(supportCryptoAssets.cryptoId, cryptoId))
        .run().changes,
    tag: 'admin/crypto/[id] PATCH',
});

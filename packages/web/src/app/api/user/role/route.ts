import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { userProfile } from '@/server/db/schema';
import { normalizeWallet } from '@/lib/payeeCrypto';

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

export async function GET(req: Request) {
    const url = new URL(req.url);
    const walletParam = url.searchParams.get('wallet');
    if (!walletParam || !WALLET_RE.test(walletParam)) {
        return Response.json({ error: 'invalid_wallet' }, { status: 400 });
    }
    const wallet = normalizeWallet(walletParam);
    const row = getDb()
        .select({
            role: userProfile.role,
            grantedAt: userProfile.grantedAt,
        })
        .from(userProfile)
        .where(eq(userProfile.walletAddress, wallet))
        .get();
    return Response.json({
        wallet,
        role: row?.role ?? null,
        grantedAt: row?.grantedAt ?? null,
    });
}

/**
 * Proof-masking dispatch.
 *
 * Maps a platform id to its `Masker`. Add a new platform by dropping a
 * `<platform>.ts` next to this file and registering it in `MASKERS` below —
 * nothing else needs to change. Unknown platforms fall back to identity
 * (i.e. "no masking"), which is the safe default for platforms whose payment
 * response returns the full identity (e.g. Wise).
 */
import type { Hex } from 'viem';
import { PLATFORM_WISE, PLATFORM_ALIPAY } from '@/platforms/registry';
import { alipayMasker } from './alipay';
import type { Masker, PayeeIdentity } from './types';

export type { Masker, PayeeIdentity } from './types';

/** No-op masker: full === masked (platform returns the identity unredacted). */
export const identityMasker: Masker = (identity) => ({
    name: identity.name,
    handle: identity.handle,
});

const MASKERS: Record<string, Masker> = {
    [PLATFORM_WISE.toLowerCase()]: identityMasker,
    [PLATFORM_ALIPAY.toLowerCase()]: alipayMasker,
};

export function maskerFor(platformId: Hex): Masker {
    return MASKERS[platformId.toLowerCase()] ?? identityMasker;
}

/**
 * Transform a full identity into the masked form used as the on-chain commit
 * pre-image for the given platform.
 */
export function maskForProof(platformId: Hex, identity: PayeeIdentity): PayeeIdentity {
    return maskerFor(platformId)(identity);
}

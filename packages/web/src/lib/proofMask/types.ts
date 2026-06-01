/**
 * Shared types for the proof-masking layer.
 *
 * A platform's payment-detail TLS response may mask the payee identity before
 * returning it (e.g. Alipay returns "* LIM HOOI YEN" instead of the full name).
 * The on-chain commit is computed over that MASKED value, while the DB stores
 * the FULL value for display. A `Masker` maps full → masked deterministically,
 * so the masked form never needs to be persisted.
 */

export interface PayeeIdentity {
    /** Display name as it appears on the platform account. */
    name: string;
    /** Handle / email / phone as it appears on the platform account. */
    handle: string;
}

/**
 * Pure, deterministic full → masked transform for one platform.
 * MUST produce a value byte-equivalent (after normalize) to what the platform's
 * payment-detail response actually returns, or off-chain commit verification
 * will fail with `name_mismatch`.
 */
export type Masker = (identity: PayeeIdentity) => PayeeIdentity;

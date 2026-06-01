import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { Hex } from 'viem';
import { getDb, type AppDb } from './client';
import {
    userProfile,
    walletPaymentBinding,
    verifyAttemptLog,
    type WalletPaymentBinding,
} from './schema';
import { normalizeWallet } from '@/lib/payeeCrypto';

function now(): number {
    return Math.floor(Date.now() / 1000);
}

export interface UpsertUserProfileResult {
    wallet: string;
    created: boolean;
}

export function upsertUserProfile(
    wallet: string,
    db: AppDb = getDb(),
): UpsertUserProfileResult {
    const w = normalizeWallet(wallet);
    const ts = now();
    const existing = db
        .select()
        .from(userProfile)
        .where(eq(userProfile.walletAddress, w))
        .get();
    if (existing) {
        return { wallet: w, created: false };
    }
    db.insert(userProfile)
        .values({
            walletAddress: w,
            role: 'buyer',
            createdAt: ts,
            updatedAt: ts,
        })
        .run();
    return { wallet: w, created: true };
}

export interface InsertBindingInput {
    wallet: string;
    platformId: Hex;
    name: string;
    handle: string;
    salt: Hex;
    nameCommit: Hex;
    idCommit: Hex;
}

export interface InsertBindingResult {
    id: number;
    supersededId: number | null;
}

export function insertBinding(
    input: InsertBindingInput,
    db: AppDb = getDb(),
): InsertBindingResult {
    const w = normalizeWallet(input.wallet);
    const ts = now();

    return db.transaction((tx) => {
        const prev = tx
            .select({ id: walletPaymentBinding.id })
            .from(walletPaymentBinding)
            .where(
                and(
                    eq(walletPaymentBinding.walletAddress, w),
                    eq(walletPaymentBinding.platformId, input.platformId),
                    eq(walletPaymentBinding.status, 'active'),
                ),
            )
            .get();

        if (prev) {
            tx.update(walletPaymentBinding)
                .set({ status: 'superseded', supersededAt: ts })
                .where(eq(walletPaymentBinding.id, prev.id))
                .run();
        }

        const inserted = tx
            .insert(walletPaymentBinding)
            .values({
                walletAddress: w,
                platformId: input.platformId,
                // Store the FULL identity verbatim (trim only) for display — the
                // commit pre-image masking/normalization happens upstream when
                // name_commit/id_commit are computed.
                plaintextName: input.name.trim(),
                plaintextHandle: input.handle.trim(),
                salt: input.salt,
                nameCommit: input.nameCommit,
                idCommit: input.idCommit,
                status: 'active',
                createdAt: ts,
            })
            .returning({ id: walletPaymentBinding.id })
            .get();

        return { id: inserted.id, supersededId: prev?.id ?? null };
    });
}

export function findActiveBinding(
    wallet: string,
    platformId: Hex,
    db: AppDb = getDb(),
): WalletPaymentBinding | undefined {
    const w = normalizeWallet(wallet);
    return db
        .select()
        .from(walletPaymentBinding)
        .where(
            and(
                eq(walletPaymentBinding.walletAddress, w),
                eq(walletPaymentBinding.platformId, platformId),
                eq(walletPaymentBinding.status, 'active'),
            ),
        )
        .get();
}

export function findBindingByNameCommit(
    nameCommit: Hex,
    db: AppDb = getDb(),
): WalletPaymentBinding | undefined {
    return db
        .select()
        .from(walletPaymentBinding)
        .where(eq(walletPaymentBinding.nameCommit, nameCommit))
        .get();
}

export interface LogVerifyAttemptInput {
    callerWallet: string;
    orderKey: string;
    role: 'payee' | 'payer';
    onchainCommit: Hex;
    result:
        | 'ok'
        | 'no_matching_binding'
        | 'name_mismatch'
        | 'id_mismatch'
        | 'proof_invalid';
    reason?: string;
}

export function logVerifyAttempt(
    input: LogVerifyAttemptInput,
    db: AppDb = getDb(),
): void {
    db.insert(verifyAttemptLog)
        .values({
            callerWallet: normalizeWallet(input.callerWallet),
            orderKey: input.orderKey,
            role: input.role,
            onchainCommit: input.onchainCommit,
            result: input.result,
            reason: input.reason,
            createdAt: now(),
        })
        .run();
}

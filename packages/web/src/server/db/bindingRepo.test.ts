import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { walletPaymentBinding } from './schema';
import {
    upsertUserProfile,
    insertBinding,
    findActiveBinding,
    findBindingByNameCommit,
    logVerifyAttempt,
} from './bindingRepo';
import { randomSalt, computeCommit } from '@/lib/payeeCrypto';

type AppDb = BetterSQLite3Database<typeof schema>;

function freshDb(): AppDb {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    // Inline schema bootstrap mirrors the Drizzle migration output;
    // tests must not depend on filesystem migration state.
    sqlite.exec(`
        CREATE TABLE user_profile (
            wallet_address TEXT PRIMARY KEY NOT NULL,
            role TEXT NOT NULL DEFAULT 'buyer',
            granted_by TEXT,
            granted_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE wallet_payment_binding (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            wallet_address TEXT NOT NULL REFERENCES user_profile(wallet_address),
            platform_id TEXT NOT NULL,
            plaintext_name TEXT NOT NULL,
            plaintext_handle TEXT NOT NULL,
            salt TEXT NOT NULL,
            name_commit TEXT NOT NULL UNIQUE,
            id_commit TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'active',
            created_at INTEGER NOT NULL,
            superseded_at INTEGER
        );
        CREATE UNIQUE INDEX uk_binding_active
          ON wallet_payment_binding (wallet_address, platform_id)
          WHERE status = 'active';
        CREATE INDEX idx_binding_lookup
          ON wallet_payment_binding (wallet_address, platform_id, status);
        CREATE TABLE admin_action_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            admin_wallet TEXT NOT NULL REFERENCES user_profile(wallet_address),
            target_wallet TEXT NOT NULL REFERENCES user_profile(wallet_address),
            action TEXT NOT NULL,
            notes TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE verify_attempt_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            caller_wallet TEXT NOT NULL,
            order_key TEXT NOT NULL,
            role TEXT NOT NULL,
            onchain_commit TEXT NOT NULL,
            result TEXT NOT NULL,
            reason TEXT,
            created_at INTEGER NOT NULL
        );
    `);
    return drizzle(sqlite, { schema });
}

const WALLET = '0xAbCdef1234567890ABCdef1234567890abCDef12';
const WALLET_LC = WALLET.toLowerCase();
const PLATFORM_WISE = ('0x' + 'aa'.repeat(32)) as `0x${string}`;
const PLATFORM_ALIPAY = ('0x' + 'bb'.repeat(32)) as `0x${string}`;

let db: AppDb;

beforeEach(() => {
    db = freshDb();
});

describe('upsertUserProfile', () => {
    it('inserts a new profile with default role=buyer (lowercased wallet)', () => {
        const res = upsertUserProfile(WALLET, db);
        expect(res.created).toBe(true);
        expect(res.wallet).toBe(WALLET_LC);
    });

    it('is idempotent', () => {
        upsertUserProfile(WALLET, db);
        const res2 = upsertUserProfile(WALLET, db);
        expect(res2.created).toBe(false);
    });
});

describe('insertBinding', () => {
    function makeBinding(
        name = 'Alice',
        handle = 'alice@wise.com',
        platform: `0x${string}` = PLATFORM_WISE,
    ) {
        const salt = randomSalt();
        return {
            wallet: WALLET,
            platformId: platform,
            name,
            handle,
            salt,
            nameCommit: computeCommit(name, salt),
            idCommit: computeCommit(handle, salt),
        };
    }

    it('inserts a fresh binding and returns a new id with no supersededId', () => {
        upsertUserProfile(WALLET, db);
        const res = insertBinding(makeBinding(), db);
        expect(res.id).toBeGreaterThan(0);
        expect(res.supersededId).toBeNull();
    });

    it('stores the full name/handle verbatim (trim only, case preserved)', () => {
        upsertUserProfile(WALLET, db);
        const res = insertBinding(makeBinding('  KELLY LIM HOOI YEN  ', '  Kelly@Hotmail.com '), db);
        const row = db
            .select()
            .from(walletPaymentBinding)
            .where(eq(walletPaymentBinding.id, res.id))
            .get()!;
        expect(row.plaintextName).toBe('KELLY LIM HOOI YEN');
        expect(row.plaintextHandle).toBe('Kelly@Hotmail.com');
    });

    it('supersedes the previous active binding when re-binding same (wallet, platform)', () => {
        upsertUserProfile(WALLET, db);
        const first = insertBinding(makeBinding('Alice', 'alice@wise.com'), db);
        const second = insertBinding(makeBinding('Alice2', 'alice2@wise.com'), db);

        expect(second.supersededId).toBe(first.id);

        const rows = db
            .select()
            .from(walletPaymentBinding)
            .where(eq(walletPaymentBinding.walletAddress, WALLET_LC))
            .all();
        expect(rows.length).toBe(2);
        const old = rows.find((r) => r.id === first.id)!;
        const cur = rows.find((r) => r.id === second.id)!;
        expect(old.status).toBe('superseded');
        expect(old.supersededAt).not.toBeNull();
        expect(cur.status).toBe('active');
    });

    it('allows the same wallet to bind on a different platform without superseding', () => {
        upsertUserProfile(WALLET, db);
        const wise = insertBinding(makeBinding('Alice', 'alice@wise', PLATFORM_WISE), db);
        const alipay = insertBinding(
            makeBinding('AlicePay', 'alice@alipay', PLATFORM_ALIPAY),
            db,
        );
        expect(wise.supersededId).toBeNull();
        expect(alipay.supersededId).toBeNull();
    });

    it('throws on UNIQUE collision when manually inserting a duplicate name_commit', () => {
        upsertUserProfile(WALLET, db);
        const b = makeBinding();
        insertBinding(b, db);
        expect(() =>
            db
                .insert(walletPaymentBinding)
                .values({
                    walletAddress: WALLET_LC,
                    platformId: PLATFORM_ALIPAY,
                    plaintextName: 'x',
                    plaintextHandle: 'y',
                    salt: '0x' + '01'.repeat(32),
                    nameCommit: b.nameCommit, // duplicate
                    idCommit: ('0x' + '02'.repeat(32)) as `0x${string}`,
                    status: 'active',
                    createdAt: 1,
                })
                .run(),
        ).toThrow();
    });
});

describe('findActiveBinding', () => {
    it('returns the active row for (wallet, platform)', () => {
        upsertUserProfile(WALLET, db);
        const salt = randomSalt();
        insertBinding(
            {
                wallet: WALLET,
                platformId: PLATFORM_WISE,
                name: 'Alice',
                handle: 'alice@wise',
                salt,
                nameCommit: computeCommit('Alice', salt),
                idCommit: computeCommit('alice@wise', salt),
            },
            db,
        );
        const found = findActiveBinding(WALLET, PLATFORM_WISE, db);
        expect(found).toBeDefined();
        expect(found!.status).toBe('active');
        // Stored verbatim (trim only) for display — case preserved.
        expect(found!.plaintextName).toBe('Alice');
    });

    it('returns undefined when no active binding exists', () => {
        expect(findActiveBinding(WALLET, PLATFORM_WISE, db)).toBeUndefined();
    });

    it('still returns only the current active row after a re-bind', () => {
        upsertUserProfile(WALLET, db);
        const s1 = randomSalt();
        insertBinding(
            {
                wallet: WALLET,
                platformId: PLATFORM_WISE,
                name: 'Old',
                handle: 'old',
                salt: s1,
                nameCommit: computeCommit('Old', s1),
                idCommit: computeCommit('old', s1),
            },
            db,
        );
        const s2 = randomSalt();
        insertBinding(
            {
                wallet: WALLET,
                platformId: PLATFORM_WISE,
                name: 'New',
                handle: 'new',
                salt: s2,
                nameCommit: computeCommit('New', s2),
                idCommit: computeCommit('new', s2),
            },
            db,
        );
        const found = findActiveBinding(WALLET, PLATFORM_WISE, db);
        expect(found!.plaintextName).toBe('New');
    });
});

describe('findBindingByNameCommit', () => {
    it('finds rows regardless of status (active OR superseded)', () => {
        upsertUserProfile(WALLET, db);
        const s1 = randomSalt();
        const nameCommit1 = computeCommit('Old', s1);
        insertBinding(
            {
                wallet: WALLET,
                platformId: PLATFORM_WISE,
                name: 'Old',
                handle: 'old',
                salt: s1,
                nameCommit: nameCommit1,
                idCommit: computeCommit('old', s1),
            },
            db,
        );
        // supersede with a new binding
        const s2 = randomSalt();
        insertBinding(
            {
                wallet: WALLET,
                platformId: PLATFORM_WISE,
                name: 'New',
                handle: 'new',
                salt: s2,
                nameCommit: computeCommit('New', s2),
                idCommit: computeCommit('new', s2),
            },
            db,
        );
        const found = findBindingByNameCommit(nameCommit1, db);
        expect(found).toBeDefined();
        expect(found!.status).toBe('superseded');
        expect(found!.salt).toBe(s1);
    });

    it('returns undefined for unknown commits', () => {
        expect(
            findBindingByNameCommit(('0x' + 'ff'.repeat(32)) as `0x${string}`, db),
        ).toBeUndefined();
    });
});

describe('logVerifyAttempt', () => {
    it('records an audit row without plaintext fields', () => {
        logVerifyAttempt(
            {
                callerWallet: WALLET,
                orderKey: '0x1:1:0:5',
                role: 'payee',
                onchainCommit: ('0x' + 'cc'.repeat(32)) as `0x${string}`,
                result: 'ok',
            },
            db,
        );
        const rows = db.select().from(schema.verifyAttemptLog).all();
        expect(rows.length).toBe(1);
        expect(rows[0].callerWallet).toBe(WALLET_LC);
        expect(rows[0].result).toBe('ok');
    });
});

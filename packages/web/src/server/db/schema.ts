import { sql } from 'drizzle-orm';
import {
    sqliteTable,
    text,
    integer,
    real,
    blob,
    primaryKey,
    foreignKey,
    uniqueIndex,
    index,
} from 'drizzle-orm/sqlite-core';

// ──────────────────────────────────────────────────────────────────────────
// user_profile — 钱包档案，承载 role
// ──────────────────────────────────────────────────────────────────────────
export const userProfile = sqliteTable('user_profile', {
    walletAddress: text('wallet_address').primaryKey(),
    role: text('role', { enum: ['buyer', 'merchant', 'both'] })
        .notNull()
        .default('buyer'),
    grantedBy: text('granted_by'),
    grantedAt: integer('granted_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
});

// ──────────────────────────────────────────────────────────────────────────
// wallet_payment_binding — 账户绑定（append-only，换绑 = 旧 supersede + 新 insert）
// ──────────────────────────────────────────────────────────────────────────
export const walletPaymentBinding = sqliteTable(
    'wallet_payment_binding',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        walletAddress: text('wallet_address')
            .notNull()
            .references(() => userProfile.walletAddress),
        platformId: text('platform_id').notNull(),
        plaintextName: text('plaintext_name').notNull(),
        plaintextHandle: text('plaintext_handle').notNull(),
        salt: text('salt').notNull(),
        nameCommit: text('name_commit').notNull().unique(),
        idCommit: text('id_commit').notNull().unique(),
        status: text('status', { enum: ['active', 'superseded'] })
            .notNull()
            .default('active'),
        createdAt: integer('created_at').notNull(),
        supersededAt: integer('superseded_at'),
    },
    (t) => ({
        // SQLite partial unique index: 同 (wallet, platform) 同时只允许一行 active
        uniqueActiveBinding: uniqueIndex('uk_binding_active')
            .on(t.walletAddress, t.platformId)
            .where(sql`${t.status} = 'active'`),
        bindingLookup: index('idx_binding_lookup').on(
            t.walletAddress,
            t.platformId,
            t.status,
        ),
    }),
);

// ──────────────────────────────────────────────────────────────────────────
// admin_action_log — admin 操作审计
// ──────────────────────────────────────────────────────────────────────────
export const adminActionLog = sqliteTable('admin_action_log', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    adminWallet: text('admin_wallet')
        .notNull()
        .references(() => userProfile.walletAddress),
    targetWallet: text('target_wallet')
        .notNull()
        .references(() => userProfile.walletAddress),
    action: text('action').notNull(),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
});

// ──────────────────────────────────────────────────────────────────────────
// verify_attempt_log — 每次 verify-counterparty 的审计记录（不存 plaintext）
// ──────────────────────────────────────────────────────────────────────────
export const verifyAttemptLog = sqliteTable('verify_attempt_log', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    callerWallet: text('caller_wallet').notNull(),
    orderKey: text('order_key').notNull(),
    role: text('role', { enum: ['payee', 'payer'] }).notNull(),
    onchainCommit: text('onchain_commit').notNull(),
    result: text('result', {
        enum: [
            'ok',
            'no_matching_binding',
            'name_mismatch',
            'id_mismatch',
            'proof_invalid',
        ],
    }).notNull(),
    reason: text('reason'),
    createdAt: integer('created_at').notNull(),
});

// ──────────────────────────────────────────────────────────────────────────
// support_crypto_assets — admin 管理 token 列表（链上 cryptoId ↔ symbol/address）
// ──────────────────────────────────────────────────────────────────────────
export const supportCryptoAssets = sqliteTable('support_crypto_assets', {
    id:           integer('id').primaryKey({ autoIncrement: true }),
    cryptoId:     integer('crypto_id').notNull().unique(),
    tokenSymbol:  text('token_symbol').notNull(),
    tokenAddress: text('token_address').notNull(),
    isActive:     integer('is_active', { mode: 'boolean' }).notNull().default(false),
    editTime:     integer('edit_time').notNull(),
    createdTime:  integer('created_time').notNull(),
});

// ──────────────────────────────────────────────────────────────────────────
// support_fiat_assets — admin 管理法币列表（链上 fiatId ↔ name）
// ──────────────────────────────────────────────────────────────────────────
export const supportFiatAssets = sqliteTable('support_fiat_assets', {
    id:          integer('id').primaryKey({ autoIncrement: true }),
    fiatId:      integer('fiat_id').notNull().unique(),
    fiatName:    text('fiat_name').notNull(),
    isActive:    integer('is_active', { mode: 'boolean' }).notNull().default(false),
    editTime:    integer('edit_time').notNull(),
    createdTime: integer('created_time').notNull(),
});

// ──────────────────────────────────────────────────────────────────────────
// userdata — 商户档案（成交率、级别、单笔限额）
// ──────────────────────────────────────────────────────────────────────────
export const userdata = sqliteTable('userdata', {
    walletAddress:        text('wallet_address').primaryKey(),
    verified:             integer('verified', { mode: 'boolean' }).notNull().default(false),
    closeRate:            real('close_rate').notNull().default(0),
    tradingVolume:        integer('trading_volume').notNull().default(0),
    closeRateBinance:     real('close_rate_binance').notNull().default(0),
    tradingVolumeBinance: integer('trading_volume_binance').notNull().default(0),
    userLevel:            integer('user_level').notNull().default(0),
    minimumAmount:        integer('minimum_amount').notNull().default(50),
    maximumAmount:        integer('maximum_amount').notNull().default(100),
    createTime:           integer('create_time').notNull(),
    updateTime:           integer('update_time').notNull(),
});

// ──────────────────────────────────────────────────────────────────────────
// payment_method — 支付方式字典
// ──────────────────────────────────────────────────────────────────────────
export const paymentMethod = sqliteTable('payment_method', {
    methodId:   integer('method_id').primaryKey({ autoIncrement: true }),
    methodName: text('method_name').notNull().unique(),
    iconUrl:    text('icon_url'),
    url:        text('url'),
});

// ──────────────────────────────────────────────────────────────────────────
// order_contract — 商户挂单（合约地址 + 资产对）
// ──────────────────────────────────────────────────────────────────────────
export const orderContract = sqliteTable(
    'order_contract',
    {
        id:              integer('id').notNull(),
        walletAddress:   text('wallet_address').notNull().references(() => userdata.walletAddress, { onDelete: 'cascade', onUpdate: 'cascade' }),
        fiatAssetName:   text('fiat_asset_name').notNull(),
        cryptoAssetName: text('crypto_asset_name').notNull(),
        fiatToCrypto:    integer('fiat_to_crypto', { mode: 'boolean' }).notNull(),
        contractAddress: text('contract_address').notNull().unique(),
        createTime:      integer('create_time').notNull(),
    },
    (t) => ({
        pk:        primaryKey({ columns: [t.id, t.walletAddress] }),
        ukOrder:   uniqueIndex('uk_order').on(t.walletAddress, t.fiatAssetName, t.cryptoAssetName, t.fiatToCrypto),
    }),
);

// ──────────────────────────────────────────────────────────────────────────
// fiat_bank_accounts — 商户收款账户
// ──────────────────────────────────────────────────────────────────────────
export const fiatBankAccounts = sqliteTable(
    'fiat_bank_accounts',
    {
        id:                 integer('id').notNull(),
        walletAddress:      text('wallet_address').notNull().references(() => userdata.walletAddress, { onDelete: 'cascade', onUpdate: 'cascade' }),
        methodIdFk:         integer('method_id_fk').notNull().references(() => paymentMethod.methodId),
        currency:           text('currency').notNull(),
        accountHolderName:  text('account_holder_name').notNull(),
        accountNumberHash:  blob('account_number_hash').notNull().unique(),
        accountLast4:       text('account_last4').notNull(),
        bankVerified:       integer('bank_verified', { mode: 'boolean' }).notNull().default(false),
        createTime:         integer('create_time').notNull(),
    },
    (t) => ({
        pk:           primaryKey({ columns: [t.id, t.walletAddress] }),
        idxFiatUser:  index('idx_fiat_user').on(t.walletAddress),
    }),
);

// ──────────────────────────────────────────────────────────────────────────
// order_index — order ↔ bank 关联（同一钱包内）
// ──────────────────────────────────────────────────────────────────────────
export const orderIndex = sqliteTable(
    'order_index',
    {
        walletAddress: text('wallet_address').notNull(),
        orderId:       integer('order_id').notNull(),
        bankId:        integer('bank_id').notNull(),
    },
    (t) => ({
        idxWallet:    index('idx_order_index_wallet').on(t.walletAddress),
        idxOrder:     index('idx_order_index_order').on(t.orderId, t.walletAddress),
        idxBank:      index('idx_order_index_bank').on(t.bankId, t.walletAddress),
        fkOrderOwner: foreignKey({
            columns:        [t.orderId, t.walletAddress],
            foreignColumns: [orderContract.id, orderContract.walletAddress],
        }).onDelete('cascade').onUpdate('cascade'),
        fkBankOwner: foreignKey({
            columns:        [t.bankId, t.walletAddress],
            foreignColumns: [fiatBankAccounts.id, fiatBankAccounts.walletAddress],
        }).onDelete('cascade').onUpdate('cascade'),
    }),
);

export type UserProfile = typeof userProfile.$inferSelect;
export type NewUserProfile = typeof userProfile.$inferInsert;
export type WalletPaymentBinding = typeof walletPaymentBinding.$inferSelect;
export type NewWalletPaymentBinding = typeof walletPaymentBinding.$inferInsert;
export type AdminActionLog = typeof adminActionLog.$inferSelect;
export type NewAdminActionLog = typeof adminActionLog.$inferInsert;
export type VerifyAttemptLog = typeof verifyAttemptLog.$inferSelect;
export type NewVerifyAttemptLog = typeof verifyAttemptLog.$inferInsert;

export type SupportCryptoAsset = typeof supportCryptoAssets.$inferSelect;
export type NewSupportCryptoAsset = typeof supportCryptoAssets.$inferInsert;
export type SupportFiatAsset = typeof supportFiatAssets.$inferSelect;
export type NewSupportFiatAsset = typeof supportFiatAssets.$inferInsert;
export type Userdata = typeof userdata.$inferSelect;
export type NewUserdata = typeof userdata.$inferInsert;
export type PaymentMethod = typeof paymentMethod.$inferSelect;
export type NewPaymentMethod = typeof paymentMethod.$inferInsert;
export type OrderContract = typeof orderContract.$inferSelect;
export type NewOrderContract = typeof orderContract.$inferInsert;
export type FiatBankAccount = typeof fiatBankAccounts.$inferSelect;
export type NewFiatBankAccount = typeof fiatBankAccounts.$inferInsert;
export type OrderIndex = typeof orderIndex.$inferSelect;
export type NewOrderIndex = typeof orderIndex.$inferInsert;

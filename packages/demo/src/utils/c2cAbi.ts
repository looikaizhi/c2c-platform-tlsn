// packages/demo/src/utils/c2cAbi.ts
// ABI definitions matching the current C2CEscrow + C2CAdmin + V4 contracts.

// ── TLSNProof tuple (shared) ──────────────────────────────────────────────────
const tlsnProofComponents = [
  { name: 'chainId',           type: 'uint64'  as const },
  { name: 'sessionId',         type: 'string'  as const },
  { name: 'commitmentsHash',   type: 'bytes32' as const },
  { name: 'orderBindingHash',  type: 'bytes32' as const },
  { name: 'policyVersionHash', type: 'bytes32' as const },
  { name: 'verifierSignature', type: 'bytes'   as const },
  {
    name: 'revealedItems', type: 'tuple[]' as const,
    components: [
      { name: 'handlerType',      type: 'string' as const },
      { name: 'part',             type: 'string' as const },
      { name: 'value',            type: 'string' as const },
      { name: 'commitment_index', type: 'uint64' as const },
      { name: 'start_item',       type: 'uint64' as const },
      { name: 'end_item',         type: 'uint64' as const },
      { name: 'start_value',      type: 'uint64' as const },
      { name: 'end_value',        type: 'uint64' as const },
    ],
  },
  {
    name: 'commitmentOpenings', type: 'tuple[]' as const,
    components: [{ name: 'blinderHex', type: 'bytes' as const }],
  },
  {
    name: 'commitments', type: 'tuple[]' as const,
    components: [
      { name: 'direction', type: 'string'  as const },
      { name: 'hashAlg',   type: 'string'  as const },
      { name: 'hashValue', type: 'bytes32' as const },
    ],
  },
  { name: 'serverName', type: 'string' as const },
] as const;

function proofArrayParam(name: string) {
  return { name, type: 'tuple[]' as const, components: tlsnProofComponents };
}

// ── BuyerPaymentInfo / PlatformBinding tuple ──────────────────────────────
const paymentInfoComponents = [
  { name: 'nameHash', type: 'bytes32' as const },
  { name: 'idHash',   type: 'bytes32' as const },
  { name: 'isSet',    type: 'bool'    as const },
] as const;

// ── MerchantRate tuple ────────────────────────────────────────────────────────
const merchantRateComponents = [
  { name: 'rate',        type: 'uint256' as const },
  { name: 'version',     type: 'uint32'  as const },
  { name: 'publishedAt', type: 'uint64'  as const },
  { name: 'expiresAt',   type: 'uint64'  as const },
] as const;

// ── SupportCryptoInfo tuple ───────────────────────────────────────────────────
const supportCryptoInfoComponents = [
  { name: 'id',           type: 'uint256'  as const },
  { name: 'tokenSymbol',  type: 'string'   as const },
  { name: 'tokenAddress', type: 'address'  as const },
  { name: 'assetType',    type: 'uint8'    as const },
  { name: 'isActive',     type: 'bool'     as const },
] as const;

// ── SupportFiatInfo tuple ─────────────────────────────────────────────────────
const supportFiatInfoComponents = [
  { name: 'id',       type: 'uint256' as const },
  { name: 'fiatName', type: 'string'  as const },
  { name: 'assetType', type: 'uint8'  as const },
  { name: 'isActive', type: 'bool'    as const },
] as const;

// ── C2CAdmin ABI ──────────────────────────────────────────────────────────────
export const C2C_ADMIN_ABI = [
  // ── Merchant registration ──────────────────────────────────────────────────
  {
    type: 'function' as const,
    name: 'registerMerchantByAdmin',
    inputs: [{ name: '_merchant', type: 'address' as const }],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'isMerchantActive',
    inputs: [{ name: '_merchant', type: 'address' as const }],
    outputs: [{ type: 'bool' as const }],
    stateMutability: 'view' as const,
  },

  // ── Payment info (per-platform) ────────────────────────────────────────────
  {
    type: 'function' as const,
    name: 'setPlatformBinding',
    inputs: [
      { name: '_platformId', type: 'bytes32' as const },
      { name: '_nameHash',   type: 'bytes32' as const },
      { name: '_idHash',     type: 'bytes32' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'getPlatformBinding',
    inputs: [
      { name: '_merchant',   type: 'address' as const },
      { name: '_platformId', type: 'bytes32' as const },
    ],
    outputs: [{
      type: 'tuple' as const,
      components: paymentInfoComponents,
    }],
    stateMutability: 'view' as const,
  },

  // ── Rate & business hours ──────────────────────────────────────────────────
  {
    type: 'function' as const,
    name: 'publishRate',
    inputs: [
      { name: '_productId', type: 'uint256' as const },
      { name: '_assetType', type: 'uint8'   as const },
      { name: '_rate',      type: 'uint256' as const },
      { name: '_expiresAt', type: 'uint64'  as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'getMerchantRate',
    inputs: [
      { name: '_merchant',  type: 'address' as const },
      { name: '_productId', type: 'uint256' as const },
      { name: '_assetType', type: 'uint8'   as const },
    ],
    outputs: [{
      type: 'tuple' as const,
      components: merchantRateComponents,
    }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'openNow',
    inputs: [
      { name: '_productId', type: 'uint256' as const },
      { name: '_assetType', type: 'uint8'   as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'closeNow',
    inputs: [
      { name: '_productId', type: 'uint256' as const },
      { name: '_assetType', type: 'uint8'   as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'isMerchantOpen',
    inputs: [
      { name: '_merchant',  type: 'address' as const },
      { name: '_productId', type: 'uint256' as const },
      { name: '_assetType', type: 'uint8'   as const },
    ],
    outputs: [{ type: 'bool' as const }],
    stateMutability: 'view' as const,
  },

  // ── Asset management ───────────────────────────────────────────────────────
  {
    type: 'function' as const,
    name: 'addCryptoInfo',
    inputs: [
      { name: '_tokenAddress', type: 'address' as const },
      { name: '_isActive',     type: 'bool'    as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'addFiatInfo',
    inputs: [
      { name: '_fiatName', type: 'string' as const },
      { name: '_isActive', type: 'bool'   as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'getSupportCryptoList',
    inputs: [],
    outputs: [{
      type: 'tuple[]' as const,
      components: supportCryptoInfoComponents,
    }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'getSupportFiatList',
    inputs: [],
    outputs: [{
      type: 'tuple[]' as const,
      components: supportFiatInfoComponents,
    }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'activateAsset',
    inputs: [
      { name: '_id',        type: 'uint256' as const },
      { name: '_assetType', type: 'uint8'   as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'deactivateAsset',
    inputs: [
      { name: '_id',        type: 'uint256' as const },
      { name: '_assetType', type: 'uint8'   as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },

  // ── Order limits ───────────────────────────────────────────────────────────
  {
    type: 'function' as const,
    name: 'maxOrderAmount',
    inputs: [],
    outputs: [{ type: 'uint256' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'setMaxOrderAmount',
    inputs: [{ name: '_amount', type: 'uint256' as const }],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },

  // ── Business hours ─────────────────────────────────────────────────────────
  {
    type: 'function' as const,
    name: 'setBusinessHours',
    inputs: [
      { name: '_productId',   type: 'uint256' as const },
      { name: '_assetType',   type: 'uint8'   as const },
      { name: '_openSecond',  type: 'uint32'  as const },
      { name: '_closeSecond', type: 'uint32'  as const },
      { name: '_activeDays',  type: 'uint8'   as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'clearManualOverride',
    inputs: [
      { name: '_productId', type: 'uint256' as const },
      { name: '_assetType', type: 'uint8'   as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    // public mapping getter: businessHours(merchant, productId, assetType)
    type: 'function' as const,
    name: 'businessHours',
    inputs: [
      { name: '_merchant',  type: 'address' as const },
      { name: '_productId', type: 'uint256' as const },
      { name: '_assetType', type: 'uint8'   as const },
    ],
    outputs: [
      { name: 'openSecond',     type: 'uint32' as const },
      { name: 'closeSecond',    type: 'uint32' as const },
      { name: 'activeDays',     type: 'uint8'  as const },
      { name: 'manualOverride', type: 'uint8'  as const },
    ],
    stateMutability: 'view' as const,
  },

  // ── Merchant state reader ──────────────────────────────────────────────────
  {
    type: 'function' as const,
    name: 'merchants',
    inputs: [{ name: '_merchant', type: 'address' as const }],
    outputs: [
      { name: 'isActive',         type: 'bool'    as const },
      { name: 'kybVerified',      type: 'bool'    as const },
      { name: 'registeredAt',     type: 'uint256' as const },
      { name: 'sellCryptoAmount', type: 'uint256' as const },
      { name: 'sellFiatAmount',   type: 'uint256' as const },
    ],
    stateMutability: 'view' as const,
  },

  // ── Authorization ──────────────────────────────────────────────────────────
  {
    type: 'function' as const,
    name: 'setAuthorizedCaller',
    inputs: [
      { name: '_caller',     type: 'address' as const },
      { name: '_authorized', type: 'bool'    as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },

  // ── Admin transfer ─────────────────────────────────────────────────────────
  {
    type: 'function' as const,
    name: 'admin',
    inputs: [],
    outputs: [{ type: 'address' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'pendingAdmin',
    inputs: [],
    outputs: [{ type: 'address' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'proposeAdmin',
    inputs: [{ name: '_newAdmin', type: 'address' as const }],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'acceptAdmin',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },

  // ── Events ─────────────────────────────────────────────────────────────────
  {
    type: 'event' as const,
    name: 'MerchantRegistered',
    inputs: [
      { name: 'merchant',     type: 'address' as const, indexed: true  },
      { name: 'registeredAt', type: 'uint256' as const, indexed: false },
    ],
  },
  {
    type: 'event' as const,
    name: 'PlatformBindingSet',
    inputs: [
      { name: 'merchant',    type: 'address' as const, indexed: true  },
      { name: 'platformId',  type: 'bytes32' as const, indexed: true  },
      { name: 'nameHash',    type: 'bytes32' as const, indexed: false },
      { name: 'idHash',      type: 'bytes32' as const, indexed: false },
    ],
  },
  {
    type: 'event' as const,
    name: 'RatePublished',
    inputs: [
      { name: 'merchant',   type: 'address' as const, indexed: true  },
      { name: 'productId',  type: 'uint256' as const, indexed: true  },
      { name: 'assetType',  type: 'uint8'   as const, indexed: true  },
      { name: 'rate',       type: 'uint256' as const, indexed: false },
      { name: 'version',    type: 'uint32'  as const, indexed: false },
      { name: 'expiresAt',  type: 'uint64'  as const, indexed: false },
    ],
  },
] as const;

// ── C2CEscrow ABI ─────────────────────────────────────────────────────────────
export const C2C_ESCROW_ABI = [
  // ── Product listing ────────────────────────────────────────────────────────
  {
    type: 'function' as const,
    name: 'listCryptoProduct',
    inputs: [
      { name: '_cryptoID',   type: 'uint256' as const },
      { name: '_fiatID',     type: 'uint256' as const },
      { name: '_amount',     type: 'uint256' as const },
      { name: '_isActive',   type: 'bool'    as const },
      { name: '_platformId', type: 'bytes32' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'listFiatProduct',
    inputs: [
      { name: '_fiatID',     type: 'uint256' as const },
      { name: '_cryptoID',   type: 'uint256' as const },
      { name: '_amount',     type: 'uint256' as const },
      { name: '_isActive',   type: 'bool'    as const },
      { name: '_platformId', type: 'bytes32' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },

  // ── Order placement (new signature — no EIP-712) ───────────────────────────
  {
    type: 'function' as const,
    name: 'placeOrder',
    inputs: [
      { name: '_merchant',   type: 'address' as const },
      { name: '_productId',  type: 'uint256' as const },
      { name: '_assetType',  type: 'uint8'   as const },
      { name: '_amount',     type: 'uint256' as const },
      { name: '_buyerInfo',  type: 'tuple'   as const, components: paymentInfoComponents },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },

  // ── Platform payment — CRYPTO product (buyer pays fiat, receives crypto) ───
  {
    type: 'function' as const,
    name: 'payOrderByPlatform',
    inputs: [
      { name: '_merchant',  type: 'address' as const },
      { name: '_productId', type: 'uint256' as const },
      { name: '_orderId',   type: 'uint256' as const },
      proofArrayParam('proofs'),
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },

  // ── Platform payment — FIAT product (merchant pays fiat, receives crypto) ──
  {
    type: 'function' as const,
    name: 'receiveCryptoWithPlatformPayment',
    inputs: [
      { name: '_productId', type: 'uint256' as const },
      { name: '_orderId',   type: 'uint256' as const },
      proofArrayParam('proofs'),
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },

  // ── Collateral management ──────────────────────────────────────────────────
  {
    type: 'function' as const,
    name: 'addAmount',
    inputs: [
      { name: '_id',        type: 'uint256' as const },
      { name: '_assetType', type: 'uint8'   as const },
      { name: '_amount',    type: 'uint256' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'takeAmount',
    inputs: [
      { name: '_id',        type: 'uint256' as const },
      { name: '_assetType', type: 'uint8'   as const },
      { name: '_amount',    type: 'uint256' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },

  // ── Platform query ─────────────────────────────────────────────────────────
  {
    type: 'function' as const,
    name: 'getProductPlatformId',
    inputs: [
      { name: '_merchant',  type: 'address' as const },
      { name: '_productId', type: 'uint256' as const },
      { name: '_assetType', type: 'uint8'   as const },
    ],
    outputs: [{ type: 'bytes32' as const }],
    stateMutability: 'view' as const,
  },

  // ── Order queries ──────────────────────────────────────────────────────────
  {
    type: 'function' as const,
    name: 'getOrder',
    inputs: [
      { name: '_merchant',  type: 'address' as const },
      { name: '_productId', type: 'uint256' as const },
      { name: '_assetType', type: 'uint8'   as const },
      { name: '_orderId',   type: 'uint256' as const },
    ],
    outputs: [
      { name: 'buyer',            type: 'address' as const },
      { name: 'amount',           type: 'uint256' as const },
      { name: 'rate',             type: 'uint256' as const },
      { name: 'deadline',         type: 'uint256' as const },
      { name: 'status',           type: 'uint8'   as const },
      { name: 'rateVersion',      type: 'uint32'  as const },
      { name: 'platformTxId',     type: 'bytes32' as const },
    ],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'hasActiveOrder',
    inputs: [
      { name: 'buyer',      type: 'address' as const },
      { name: 'merchant',   type: 'address' as const },
      { name: 'assetType',  type: 'uint8'   as const },
      { name: 'productId',  type: 'uint256' as const },
    ],
    outputs: [{ type: 'bool' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'getBuyerPaymentInfo',
    inputs: [
      { name: '_merchant',  type: 'address' as const },
      { name: '_productId', type: 'uint256' as const },
      { name: '_orderId',   type: 'uint256' as const },
    ],
    outputs: [{
      type: 'tuple' as const,
      components: paymentInfoComponents,
    }],
    stateMutability: 'view' as const,
  },

  // ── Events ─────────────────────────────────────────────────────────────────
  {
    type: 'event' as const,
    name: 'ProductCollateralChanged',
    inputs: [
      { name: 'merchant',             type: 'address' as const, indexed: true  },
      { name: 'productId',            type: 'uint256' as const, indexed: true  },
      { name: 'assetType',            type: 'uint8'   as const, indexed: true  },
      { name: 'delta',                type: 'int256'  as const, indexed: false },
      { name: 'collateralAmount',     type: 'uint256' as const, indexed: false },
      { name: 'pendingAmount',        type: 'uint256' as const, indexed: false },
      { name: 'buyerEscrowedAmount',  type: 'uint256' as const, indexed: false },
    ],
  },
  {
    type: 'event' as const,
    name: 'ProductListed',
    inputs: [
      { name: 'merchant',         type: 'address' as const, indexed: true  },
      { name: 'productId',        type: 'uint256' as const, indexed: true  },
      { name: 'assetType',        type: 'uint8'   as const, indexed: true  },
      { name: 'cryptoID',         type: 'uint256' as const, indexed: false },
      { name: 'fiatID',           type: 'uint256' as const, indexed: false },
      { name: 'collateralAmount', type: 'uint256' as const, indexed: false },
      { name: 'isActive',         type: 'bool'    as const, indexed: false },
    ],
  },
  {
    type: 'event' as const,
    name: 'OrderPlaced',
    inputs: [
      { name: 'buyer',     type: 'address' as const, indexed: true  },
      { name: 'merchant',  type: 'address' as const, indexed: true  },
      { name: 'orderId',   type: 'uint256' as const, indexed: true  },
      { name: 'productId', type: 'uint256' as const, indexed: false },
      { name: 'assetType', type: 'uint8'   as const, indexed: false },
      { name: 'amount',    type: 'uint256' as const, indexed: false },
      { name: 'rate',      type: 'uint256' as const, indexed: false },
      { name: 'deadline',  type: 'uint256' as const, indexed: false },
      { name: 'salt',      type: 'uint256' as const, indexed: false },
    ],
  },
  {
    type: 'event' as const,
    name: 'OrderStatusChanged',
    inputs: [
      { name: 'buyer',     type: 'address' as const, indexed: true  },
      { name: 'merchant',  type: 'address' as const, indexed: true  },
      { name: 'orderId',   type: 'uint256' as const, indexed: true  },
      { name: 'productId', type: 'uint256' as const, indexed: false },
      { name: 'assetType', type: 'uint8'   as const, indexed: false },
      { name: 'status',    type: 'uint8'   as const, indexed: false },
      { name: 'deadline',  type: 'uint256' as const, indexed: false },
    ],
  },
] as const;

// ── TLSNVerifier ABI (minimal — only what the deploy script needs) ────────────
export const TLSN_VERIFIER_ABI = [
  {
    type: 'function' as const,
    name: 'PLATFORM_WISE',
    inputs: [],
    outputs: [{ type: 'bytes32' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'PLATFORM_ALIPAY',
    inputs: [],
    outputs: [{ type: 'bytes32' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'setAuthorizedCaller',
    inputs: [
      { name: '_caller',     type: 'address' as const },
      { name: '_authorized', type: 'bool'    as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'addTrustedVerifier',
    inputs: [{ name: '_verifier', type: 'address' as const }],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'addTrustedKYBServer',
    inputs: [{ name: '_server', type: 'string' as const }],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'addTrustedPaymentServer',
    inputs: [{ name: '_server', type: 'string' as const }],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'setPlatformVerifier',
    inputs: [
      { name: '_platformId', type: 'bytes32' as const },
      { name: '_verifier',   type: 'address' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'platformVerifiers',
    inputs: [{ name: '_platformId', type: 'bytes32' as const }],
    outputs: [{ type: 'address' as const }],
    stateMutability: 'view' as const,
  },
] as const;

// ── C2CBondVault ABI ──────────────────────────────────────────────────────────
export const C2C_BOND_VAULT_ABI = [
  {
    type: 'function' as const,
    name: 'createOrderBond',
    inputs: [
      { name: 'orderKey',    type: 'bytes32' as const },
      { name: 'token',       type: 'address' as const },
      { name: 'prover',      type: 'address' as const },
      { name: 'counterpart', type: 'address' as const },
      { name: 'bond',        type: 'uint256' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'settle',
    inputs: [
      { name: 'orderKey', type: 'bytes32' as const },
      { name: 'stype',    type: 'uint8'   as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'claim',
    inputs: [
      { name: 'token', type: 'address' as const },
    ],
    outputs: [{ name: 'amount', type: 'uint256' as const }],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'claimableBalance',
    inputs: [
      { name: 'user',  type: 'address' as const },
      { name: 'token', type: 'address' as const },
    ],
    outputs: [{ type: 'uint256' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'orderBonds',
    inputs: [{ name: 'orderKey', type: 'bytes32' as const }],
    outputs: [
      { name: 'token',       type: 'address' as const },
      { name: 'prover',      type: 'address' as const },
      { name: 'counterpart', type: 'address' as const },
      { name: 'bond',        type: 'uint256' as const },
      { name: 'initialized', type: 'bool'    as const },
      { name: 'settled',     type: 'bool'    as const },
    ],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'setEscrow',
    inputs: [{ name: '_escrow', type: 'address' as const }],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'event' as const,
    name: 'OrderBondCreated',
    inputs: [
      { name: 'orderKey',    type: 'bytes32' as const, indexed: true  },
      { name: 'token',       type: 'address' as const, indexed: false },
      { name: 'prover',      type: 'address' as const, indexed: false },
      { name: 'counterpart', type: 'address' as const, indexed: false },
      { name: 'bond',        type: 'uint256' as const, indexed: false },
    ],
  },
  {
    type: 'event' as const,
    name: 'OrderBondSettled',
    inputs: [
      { name: 'orderKey',  type: 'bytes32' as const, indexed: true  },
      { name: 'stype',     type: 'uint8'   as const, indexed: false },
      { name: 'recipient', type: 'address' as const, indexed: false },
      { name: 'amount',    type: 'uint256' as const, indexed: false },
    ],
  },
  {
    type: 'event' as const,
    name: 'ClaimableIncreased',
    inputs: [
      { name: 'user',   type: 'address' as const, indexed: true  },
      { name: 'token',  type: 'address' as const, indexed: true  },
      { name: 'amount', type: 'uint256' as const, indexed: false },
    ],
  },
  {
    type: 'event' as const,
    name: 'Claimed',
    inputs: [
      { name: 'user',   type: 'address' as const, indexed: true  },
      { name: 'token',  type: 'address' as const, indexed: true  },
      { name: 'amount', type: 'uint256' as const, indexed: false },
    ],
  },
] as const;

// ── C2CRiskManager ABI ────────────────────────────────────────────────────────
const reputationViewComponents = [
  { name: 'completedCount',            type: 'uint32' as const },
  { name: 'timeoutCount',              type: 'uint32' as const },
  { name: 'consecutiveTimeouts',       type: 'uint8'  as const },
  { name: 'completedSinceLastTimeout', type: 'uint8'  as const },
  { name: 'riskLevel',                 type: 'uint8'  as const },
  { name: 'temporarilyFrozen',         type: 'bool'   as const },
  { name: 'blacklisted',               type: 'bool'   as const },
  { name: 'frozenUntil',               type: 'uint64' as const },
  { name: 'lastTimeoutAt',             type: 'uint64' as const },
] as const;

export const C2C_RISK_MANAGER_ABI = [
  {
    type: 'function' as const,
    name: 'requiredBondBps',
    inputs: [{ name: 'user', type: 'address' as const }],
    outputs: [{ type: 'uint16' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'getReputation',
    inputs: [{ name: 'user', type: 'address' as const }],
    outputs: [{
      type: 'tuple' as const,
      components: reputationViewComponents,
    }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'onCompleted',
    inputs: [{ name: 'user', type: 'address' as const }],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'onTimeout',
    inputs: [{ name: 'user', type: 'address' as const }],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'setBlacklist',
    inputs: [
      { name: 'user',  type: 'address' as const },
      { name: 'value', type: 'bool'    as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'manualUnfreeze',
    inputs: [{ name: 'user', type: 'address' as const }],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'setRiskConfig',
    inputs: [
      { name: '_min',             type: 'uint16' as const },
      { name: '_base',            type: 'uint16' as const },
      { name: '_max',             type: 'uint16' as const },
      { name: '_step',            type: 'uint16' as const },
      { name: '_reset',           type: 'uint8'  as const },
      { name: '_freezeThreshold', type: 'uint32' as const },
      { name: '_rewardThreshold', type: 'uint32' as const },
      { name: '_decayDays',       type: 'uint32' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'setEscrow',
    inputs: [{ name: '_escrow', type: 'address' as const }],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'minBondBps',
    inputs: [],
    outputs: [{ type: 'uint16' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'baseBondBps',
    inputs: [],
    outputs: [{ type: 'uint16' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'maxBondBps',
    inputs: [],
    outputs: [{ type: 'uint16' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'stepBps',
    inputs: [],
    outputs: [{ type: 'uint16' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'freezeDays',
    inputs: [],
    outputs: [{ type: 'uint32' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'decayIntervalDays',
    inputs: [],
    outputs: [{ type: 'uint32' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'freezeThreshold',
    inputs: [],
    outputs: [{ type: 'uint32' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'rewardCompletedThreshold',
    inputs: [],
    outputs: [{ type: 'uint32' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'resetThreshold',
    inputs: [],
    outputs: [{ type: 'uint8' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'event' as const,
    name: 'ReputationUpdated',
    inputs: [
      { name: 'user',        type: 'address' as const, indexed: true  },
      { name: 'riskLevel',   type: 'uint8'   as const, indexed: false },
      { name: 'completed',   type: 'uint32'  as const, indexed: false },
      { name: 'timeouts',    type: 'uint32'  as const, indexed: false },
      { name: 'frozen',      type: 'bool'    as const, indexed: false },
      { name: 'blacklisted', type: 'bool'    as const, indexed: false },
    ],
  },
  {
    type: 'event' as const,
    name: 'BlacklistUpdated',
    inputs: [
      { name: 'user',  type: 'address' as const, indexed: true  },
      { name: 'value', type: 'bool'    as const, indexed: false },
    ],
  },
  {
    type: 'event' as const,
    name: 'FreezeUpdated',
    inputs: [
      { name: 'user',        type: 'address' as const, indexed: true  },
      { name: 'frozen',      type: 'bool'    as const, indexed: false },
      { name: 'frozenUntil', type: 'uint64'  as const, indexed: false },
    ],
  },
  {
    type: 'event' as const,
    name: 'RiskConfigUpdated',
    inputs: [
      { name: 'min',  type: 'uint16' as const, indexed: false },
      { name: 'base', type: 'uint16' as const, indexed: false },
      { name: 'max',  type: 'uint16' as const, indexed: false },
      { name: 'step', type: 'uint16' as const, indexed: false },
    ],
  },
] as const;

// ── ERC20 ABI ─────────────────────────────────────────────────────────────────
export const ERC20_ABI = [
  {
    type: 'function' as const,
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' as const }],
    outputs: [{ type: 'uint256' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'allowance',
    inputs: [
      { name: 'owner',   type: 'address' as const },
      { name: 'spender', type: 'address' as const },
    ],
    outputs: [{ type: 'uint256' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' as const },
      { name: 'amount',  type: 'uint256' as const },
    ],
    outputs: [{ type: 'bool' as const }],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'mint',
    inputs: [
      { name: 'to',     type: 'address' as const },
      { name: 'amount', type: 'uint256' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    type: 'function' as const,
    name: 'symbol',
    inputs: [],
    outputs: [{ type: 'string' as const }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'decimals',
    inputs: [],
    outputs: [{ type: 'uint8' as const }],
    stateMutability: 'view' as const,
  },
] as const;

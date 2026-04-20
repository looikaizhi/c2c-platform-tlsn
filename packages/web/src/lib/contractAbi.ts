/**
 * ABI definitions for C2C platform contracts.
 */

const tlsnProofTuple = {
    type: 'tuple' as const,
    components: [
        { name: 'chainId', type: 'uint64' as const },
        { name: 'sessionId', type: 'string' as const },
        { name: 'commitmentsHash', type: 'bytes32' as const },
        { name: 'orderBindingHash', type: 'bytes32' as const },
        { name: 'verifierSignature', type: 'bytes' as const },
        {
            name: 'revealedItems',
            type: 'tuple[]' as const,
            components: [
                { name: 'handlerType', type: 'string' as const },
                { name: 'part', type: 'string' as const },
                { name: 'value', type: 'string' as const },
                { name: 'commitment_index', type: 'uint64' as const },
                { name: 'start_item', type: 'uint64' as const },
                { name: 'end_item', type: 'uint64' as const },
                { name: 'start_value', type: 'uint64' as const },
                { name: 'end_value', type: 'uint64' as const },
            ],
        },
        {
            name: 'commitmentOpenings',
            type: 'tuple[]' as const,
            components: [{ name: 'blinderHex', type: 'bytes' as const }],
        },
        {
            name: 'commitments',
            type: 'tuple[]' as const,
            components: [
                { name: 'direction', type: 'string' as const },
                { name: 'hashAlg', type: 'string' as const },
                { name: 'hashValue', type: 'bytes32' as const },
            ],
        },
        { name: 'serverName', type: 'string' as const },
    ],
};

function proofParam(name: string) {
    return { ...tlsnProofTuple, name };
}

const signedOrderTuple = {
    type: 'tuple' as const,
    components: [
        { name: 'merchant', type: 'address' as const },
        { name: 'buyer', type: 'address' as const },
        { name: 'productID', type: 'uint256' as const },
        { name: 'assetType', type: 'uint8' as const },
        { name: 'amount', type: 'uint256' as const },
        { name: 'rate', type: 'uint256' as const },
        { name: 'salt', type: 'uint256' as const },
        { name: 'deadline', type: 'uint256' as const },
    ],
};

// ── C2CAdmin ABI ──────────────────────────────────────────────

export const C2C_ADMIN_ABI = [
    {
        type: 'function' as const,
        name: 'registerMerchant',
        inputs: [proofParam('proof')],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'registerMerchantByAdmin',
        inputs: [{ name: '_merchant', type: 'address' as const }],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'setMerchantFiatAccount',
        inputs: [{ name: 'account', type: 'string' as const }],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'isMerchantActive',
        inputs: [{ name: '_merchant', type: 'address' as const }],
        outputs: [{ name: '', type: 'bool' as const }],
        stateMutability: 'view' as const,
    },
    {
        type: 'function' as const,
        name: 'getMerchantFiatAccount',
        inputs: [{ name: '_merchant', type: 'address' as const }],
        outputs: [{ name: '', type: 'string' as const }],
        stateMutability: 'view' as const,
    },
    {
        type: 'function' as const,
        name: 'getSupportCryptoCount',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' as const }],
        stateMutability: 'view' as const,
    },
    {
        type: 'function' as const,
        name: 'getSupportFiatCount',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' as const }],
        stateMutability: 'view' as const,
    },
    {
        type: 'function' as const,
        name: 'getSupportCryptoInfo',
        inputs: [{ name: '_id', type: 'uint256' as const }],
        outputs: [
            {
                name: '',
                type: 'tuple' as const,
                components: [
                    { name: 'id', type: 'uint256' as const },
                    { name: 'tokenSymbol', type: 'string' as const },
                    { name: 'tokenAddress', type: 'address' as const },
                    { name: 'assetType', type: 'uint8' as const },
                    { name: 'isActive', type: 'bool' as const },
                ],
            },
        ],
        stateMutability: 'view' as const,
    },
    {
        type: 'function' as const,
        name: 'getSupportFiatInfo',
        inputs: [{ name: '_id', type: 'uint256' as const }],
        outputs: [
            {
                name: '',
                type: 'tuple' as const,
                components: [
                    { name: 'id', type: 'uint256' as const },
                    { name: 'fiatName', type: 'string' as const },
                    { name: 'assetType', type: 'uint8' as const },
                    { name: 'isActive', type: 'bool' as const },
                ],
            },
        ],
        stateMutability: 'view' as const,
    },
    {
        type: 'function' as const,
        name: 'getSupportCryptoList',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'tuple[]' as const,
                components: [
                    { name: 'id', type: 'uint256' as const },
                    { name: 'tokenSymbol', type: 'string' as const },
                    { name: 'tokenAddress', type: 'address' as const },
                    { name: 'assetType', type: 'uint8' as const },
                    { name: 'isActive', type: 'bool' as const },
                ],
            },
        ],
        stateMutability: 'view' as const,
    },
    {
        type: 'function' as const,
        name: 'getSupportFiatList',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'tuple[]' as const,
                components: [
                    { name: 'id', type: 'uint256' as const },
                    { name: 'fiatName', type: 'string' as const },
                    { name: 'assetType', type: 'uint8' as const },
                    { name: 'isActive', type: 'bool' as const },
                ],
            },
        ],
        stateMutability: 'view' as const,
    },
    {
        type: 'function' as const,
        name: 'getCryptoTokenAddress',
        inputs: [{ name: '_cryptoID', type: 'uint256' as const }],
        outputs: [{ name: '', type: 'address' as const }],
        stateMutability: 'view' as const,
    },
    {
        type: 'function' as const,
        name: 'merchants',
        inputs: [{ name: '', type: 'address' as const }],
        outputs: [
            { name: 'isActive', type: 'bool' as const },
            { name: 'kybVerified', type: 'bool' as const },
            { name: 'registeredAt', type: 'uint256' as const },
            { name: 'sellCryptoAmount', type: 'uint256' as const },
            { name: 'sellFiatAmount', type: 'uint256' as const },
        ],
        stateMutability: 'view' as const,
    },
    // ── Admin-only write functions ──────────────────────────────
    {
        type: 'function' as const,
        name: 'addCryptoInfo',
        inputs: [
            { name: '_tokenAddress', type: 'address' as const },
            { name: '_isActive', type: 'bool' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'addFiatInfo',
        inputs: [
            { name: '_fiatName', type: 'string' as const },
            { name: '_isActive', type: 'bool' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'activateAsset',
        inputs: [
            { name: '_id', type: 'uint256' as const },
            { name: '_assetType', type: 'uint8' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'deactivateAsset',
        inputs: [
            { name: '_id', type: 'uint256' as const },
            { name: '_assetType', type: 'uint8' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
] as const;

// ── C2CEscrow ABI ─────────────────────────────────────────────

export const C2C_ESCROW_ABI = [
    // ── Order placement & cancellation ──
    {
        type: 'function' as const,
        name: 'placeOrder',
        inputs: [
            { ...signedOrderTuple, name: 'so' },
            { name: 'signature', type: 'bytes' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'cancelOrder',
        inputs: [
            { name: '_merchant', type: 'address' as const },
            { name: '_productId', type: 'uint256' as const },
            { name: '_assetType', type: 'uint8' as const },
            { name: '_orderId', type: 'uint256' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },

    // ── Payment functions ──
    {
        type: 'function' as const,
        name: 'payOrderByFiat',
        inputs: [
            { name: '_merchant', type: 'address' as const },
            { name: '_productId', type: 'uint256' as const },
            { name: '_orderId', type: 'uint256' as const },
            proofParam('proof'),
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'payOrderByWise',
        inputs: [
            { name: '_merchant', type: 'address' as const },
            { name: '_productId', type: 'uint256' as const },
            { name: '_orderId', type: 'uint256' as const },
            proofParam('contactsProof'),
            proofParam('transferProof'),
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'payOrderByCrypto',
        inputs: [
            { name: '_merchant', type: 'address' as const },
            { name: '_productId', type: 'uint256' as const },
            { name: '_orderId', type: 'uint256' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'payOrderByAlipay',
        inputs: [
            { name: '_merchant', type: 'address' as const },
            { name: '_productId', type: 'uint256' as const },
            { name: '_orderId', type: 'uint256' as const },
            proofParam('proof'),
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'receiveCryptoWithPayment',
        inputs: [
            { name: '_productId', type: 'uint256' as const },
            { name: '_orderId', type: 'uint256' as const },
            proofParam('proof'),
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'receiveCryptoWithAlipayPayment',
        inputs: [
            { name: '_productId', type: 'uint256' as const },
            { name: '_orderId', type: 'uint256' as const },
            proofParam('proof'),
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'claimRefundAfterTimeout',
        inputs: [
            { name: '_merchant', type: 'address' as const },
            { name: '_productId', type: 'uint256' as const },
            { name: '_orderId', type: 'uint256' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },

    // ── Product management (merchant) ──
    {
        type: 'function' as const,
        name: 'listCryptoProduct',
        inputs: [
            { name: '_cryptoID', type: 'uint256' as const },
            { name: '_fiatID', type: 'uint256' as const },
            { name: '_amount', type: 'uint256' as const },
            { name: '_isActive', type: 'bool' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'listFiatProduct',
        inputs: [
            { name: '_fiatID', type: 'uint256' as const },
            { name: '_cryptoID', type: 'uint256' as const },
            { name: '_amount', type: 'uint256' as const },
            { name: '_isActive', type: 'bool' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'activeProduct',
        inputs: [
            { name: '_id', type: 'uint256' as const },
            { name: '_assetType', type: 'uint8' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'inactiveProduct',
        inputs: [
            { name: '_id', type: 'uint256' as const },
            { name: '_assetType', type: 'uint8' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'addAmount',
        inputs: [
            { name: '_id', type: 'uint256' as const },
            { name: '_assetType', type: 'uint8' as const },
            { name: '_amount', type: 'uint256' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'takeAmount',
        inputs: [
            { name: '_id', type: 'uint256' as const },
            { name: '_assetType', type: 'uint8' as const },
            { name: '_amount', type: 'uint256' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'cleanupProductExpired',
        inputs: [
            { name: '_merchant', type: 'address' as const },
            { name: '_productId', type: 'uint256' as const },
            { name: '_assetType', type: 'uint8' as const },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
] as const;

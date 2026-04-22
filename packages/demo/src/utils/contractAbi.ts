/**
 * Minimal ABI definitions for C2C platform contracts.
 * Extracted from Hardhat compilation artifacts.
 */

const tlsnProofTuple = {
    type: 'tuple' as const,
    components: [
        { name: 'chainId', type: 'uint64' as const },
        { name: 'sessionId', type: 'string' as const },
        { name: 'commitmentsHash', type: 'bytes32' as const },
        { name: 'orderBindingHash', type: 'bytes32' as const },
        { name: 'policyVersionHash', type: 'bytes32' as const },
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

function proofArrayParam(name: string) {
    return { name, type: 'tuple[]' as const, components: tlsnProofTuple.components };
}

export const C2C_ADMIN_ABI = [
    {
        type: 'function' as const,
        name: 'registerMerchant',
        inputs: [proofParam('proof')],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
] as const;

export const C2C_ESCROW_ABI = [
    {
        type: 'function' as const,
        name: 'payOrderByPlatform',
        inputs: [
            { name: '_merchant', type: 'address' as const },
            { name: '_productId', type: 'uint256' as const },
            { name: '_orderId', type: 'uint256' as const },
            proofArrayParam('proofs'),
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
    {
        type: 'function' as const,
        name: 'receiveCryptoWithPlatformPayment',
        inputs: [
            { name: '_productId', type: 'uint256' as const },
            { name: '_orderId', type: 'uint256' as const },
            proofArrayParam('proofs'),
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
    },
] as const;

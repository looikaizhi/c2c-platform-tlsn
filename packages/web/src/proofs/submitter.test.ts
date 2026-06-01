import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Address, Hex } from 'viem';
import { submitProof } from './submitter';
import { platformByKey } from '@/platforms/registry';
import type { PluginResult } from '@/platforms/types';
import type { NetworkConfig } from '@/chain/networkRegistry';

const MERCHANT = '0x1111111111111111111111111111111111111111' as Address;
const ESCROW   = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address;
const ADMIN    = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const FAKE_HASH = ('0x' + '1'.repeat(64)) as Hex;

const network = {
    chainId: 31337,
    name:    'Hardhat',
    chain:   { id: 31337, name: 'hardhat', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [] } } } as any,
    isTestnet: true,
    contracts: {
        c2cAdmin:       ADMIN,
        c2cEscrow:      ESCROW,
        c2cBondVault:   '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address,
        c2cRiskManager: '0xcccccccccccccccccccccccccccccccccccccccc' as Address,
        usdtToken:      '0xdddddddddddddddddddddddddddddddddddddddd' as Address,
        usdcToken:      '0xdddddddddddddddddddddddddddddddddddddddd' as Address,
        daiToken:       '0xdddddddddddddddddddddddddddddddddddddddd' as Address,
    },
} as NetworkConfig;

// Mock the escrow writer so we observe the call shape without touching RPC.
vi.mock('@/chain/writers/escrowWriter', () => ({
    payOrderByPlatform: vi.fn(async (chainId: number, params: unknown) => ({
        hash: FAKE_HASH,
        receipt: { status: 'success', transactionHash: FAKE_HASH, logs: [], _chainId: chainId, _params: params } as any,
    })),
    receiveCryptoWithPlatformPayment: vi.fn(async (chainId: number, params: unknown) => ({
        hash: FAKE_HASH,
        receipt: { status: 'success', transactionHash: FAKE_HASH, logs: [], _chainId: chainId, _params: params } as any,
    })),
}));

// Mock buildContractProof so we don't validate verifier signatures here.
vi.mock('./transformer', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./transformer')>();
    return {
        ...actual,
        buildContractProof: vi.fn(() => ({
            chainId: 31337n,
            sessionId: 'session-stub',
            commitmentsHash:   '0x00' as Hex,
            orderBindingHash:  '0x00' as Hex,
            policyVersionHash: '0x00' as Hex,
            verifierSignature: '0x00' as Hex,
            revealedItems:      [],
            commitmentOpenings: [],
            commitments:        [],
            serverName:         'stub',
        })),
    };
});

const fakeSingle: PluginResult = { kind: 'single', proof: {} as never };
const fakeDual:   PluginResult = { kind: 'dual', contacts: {} as never, transfer: {} as never };

import * as escrow from '@/chain/writers/escrowWriter';

beforeEach(() => {
    (escrow.payOrderByPlatform as unknown as ReturnType<typeof vi.fn>).mockClear();
    (escrow.receiveCryptoWithPlatformPayment as unknown as ReturnType<typeof vi.fn>).mockClear();
});

describe('submitProof — quadrants', () => {
    it('alipay + crypto → payOrderByPlatform with merchant + 1 proof', async () => {
        await submitProof({
            platform:  platformByKey('alipay'),
            direction: 'crypto',
            merchant:  MERCHANT,
            productId: 1n,
            orderId:   2n,
            proof:     fakeSingle,
            network,
        });
        expect(escrow.payOrderByPlatform).toHaveBeenCalledTimes(1);
        const [chainId, params] = (escrow.payOrderByPlatform as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(chainId).toBe(31337);
        expect(params).toMatchObject({ merchant: MERCHANT, productId: 1n, orderId: 2n });
        expect((params as any).proofs).toHaveLength(1);
    });

    it('alipay + fiat → receiveCryptoWithPlatformPayment + 1 proof', async () => {
        await submitProof({
            platform:  platformByKey('alipay'),
            direction: 'fiat',
            productId: 1n,
            orderId:   2n,
            proof:     fakeSingle,
            network,
        });
        expect(escrow.receiveCryptoWithPlatformPayment).toHaveBeenCalledTimes(1);
        const [, params] = (escrow.receiveCryptoWithPlatformPayment as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(params).not.toHaveProperty('merchant');
        expect((params as any).proofs).toHaveLength(1);
    });

    it('wise + crypto → payOrderByPlatform with merchant + 2 proofs', async () => {
        await submitProof({
            platform:  platformByKey('wise'),
            direction: 'crypto',
            merchant:  MERCHANT,
            productId: 1n,
            orderId:   2n,
            proof:     fakeDual,
            network,
        });
        const [, params] = (escrow.payOrderByPlatform as ReturnType<typeof vi.fn>).mock.calls[0];
        expect((params as any).merchant).toBe(MERCHANT);
        expect((params as any).proofs).toHaveLength(2);
    });

    it('wise + fiat → receiveCryptoWithPlatformPayment + 2 proofs', async () => {
        await submitProof({
            platform:  platformByKey('wise'),
            direction: 'fiat',
            productId: 1n,
            orderId:   2n,
            proof:     fakeDual,
            network,
        });
        const [, params] = (escrow.receiveCryptoWithPlatformPayment as ReturnType<typeof vi.fn>).mock.calls[0];
        expect((params as any).proofs).toHaveLength(2);
    });
});

describe('submitProof — guards', () => {
    it('throws when proof.kind mismatches platform.proofShape', async () => {
        await expect(submitProof({
            platform:  platformByKey('alipay'),
            direction: 'crypto',
            merchant:  MERCHANT,
            productId: 1n,
            orderId:   2n,
            proof:     fakeDual,
            network,
        })).rejects.toThrow(/expects single proof, got dual/);
    });

    it('throws when crypto direction has no merchant', async () => {
        await expect(submitProof({
            platform:  platformByKey('alipay'),
            direction: 'crypto',
            productId: 1n,
            orderId:   2n,
            proof:     fakeSingle,
            network,
        })).rejects.toThrow(/merchant address required/);
    });
});

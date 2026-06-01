import { keccak256, toBytes, type Hex } from 'viem';
import type { PaymentPlatform, PluginResult } from './types';
import {
    computeOrderBindingHash,
    ORDER_BINDING_HASH_SENTINEL,
    MERCHANT_NAME_HASH_SENTINEL,
    MERCHANT_ID_HASH_SENTINEL,
    PAYEE_NAME_HASH_SENTINEL,
    PAYEE_ID_HASH_SENTINEL,
    type ExtensionProveResponse,
} from '@/proofs/transformer';

export const alipay: PaymentPlatform = {
    id:         keccak256(toBytes('alipay')),
    key:        'alipay',
    label:      'Alipay',
    pluginUrl:  '/plugins/alipay.js',
    proofShape: 'single',
    buildInjections(ctx) {
        const bindingHash = computeOrderBindingHash(ctx) as Hex;
        return {
            [ORDER_BINDING_HASH_SENTINEL]:  bindingHash,
            [MERCHANT_NAME_HASH_SENTINEL]:  ctx.merchantNameHash,
            [MERCHANT_ID_HASH_SENTINEL]:    ctx.merchantIdHash,
            [PAYEE_NAME_HASH_SENTINEL]:     ctx.payeeNameHash,
            [PAYEE_ID_HASH_SENTINEL]:       ctx.payeeIdHash,
        };
    },
    parsePluginResult(json): PluginResult {
        const proof = JSON.parse(json) as ExtensionProveResponse;
        if (!proof?.results || !proof?.transcriptCommitments) {
            throw new Error('Alipay plugin returned malformed result — expected ExtensionProveResponse shape');
        }
        return { kind: 'single', proof };
    },
};

import { keccak256, toBytes, type Hex } from 'viem';
import type { PaymentPlatform, PluginResult } from './types';
import {
    computeOrderBindingHash,
    ORDER_BINDING_HASH_SENTINEL,
    MERCHANT_NAME_HASH_SENTINEL,
    MERCHANT_ID_HASH_SENTINEL,
    PAYEE_NAME_HASH_SENTINEL,
    PAYEE_ID_HASH_SENTINEL,
    TRANSFER_ORDER_BINDING_HASH_SENTINEL,
    type ExtensionProveResponse,
} from '@/proofs/transformer';

export const wise: PaymentPlatform = {
    id:         keccak256(toBytes('wise')),
    key:        'wise',
    label:      'Wise',
    pluginUrl:  '/plugins/wise.js',
    proofShape: 'dual',
    buildInjections(ctx, extra) {
        if (!extra?.transferBindingHash) {
            throw new Error('Wise (dual) requires extra.transferBindingHash');
        }
        const contactsBindingHash = computeOrderBindingHash(ctx) as Hex;
        return {
            [ORDER_BINDING_HASH_SENTINEL]:          contactsBindingHash,
            [MERCHANT_NAME_HASH_SENTINEL]:          ctx.merchantNameHash,
            [MERCHANT_ID_HASH_SENTINEL]:            ctx.merchantIdHash,
            [PAYEE_NAME_HASH_SENTINEL]:             ctx.payeeNameHash,
            [PAYEE_ID_HASH_SENTINEL]:               ctx.payeeIdHash,
            [TRANSFER_ORDER_BINDING_HASH_SENTINEL]: extra.transferBindingHash,
        };
    },
    parsePluginResult(json): PluginResult {
        const parsed = JSON.parse(json) as {
            proofs: { contacts: ExtensionProveResponse; transfer: ExtensionProveResponse };
        };
        if (!parsed?.proofs?.contacts || !parsed?.proofs?.transfer) {
            throw new Error('Wise plugin returned malformed result — expected proofs.contacts + proofs.transfer');
        }
        return { kind: 'dual', contacts: parsed.proofs.contacts, transfer: parsed.proofs.transfer };
    },
};

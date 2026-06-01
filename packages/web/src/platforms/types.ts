import type { Hex } from 'viem';
import type {
    ExtensionProveResponse,
    OrderBindingContext,
} from '@/proofs/transformer';

export type ProofShape = 'single' | 'dual';
export type PlatformInjections = Readonly<Record<string, Hex>>;

export interface SingleProofResult {
    kind:  'single';
    proof: ExtensionProveResponse;
}
export interface DualProofResult {
    kind:     'dual';
    contacts: ExtensionProveResponse;
    transfer: ExtensionProveResponse;
}
export type PluginResult = SingleProofResult | DualProofResult;

export interface PaymentPlatform {
    /** keccak256(toBytes(key)) — must match the on-chain platform id. */
    readonly id:         Hex;
    readonly key:        'wise' | 'alipay';
    readonly label:      string;
    readonly pluginUrl:  string;
    readonly proofShape: ProofShape;
    /** Build the marker → hex value map injected into plugin source. */
    buildInjections(
        ctx: OrderBindingContext,
        extra?: { transferBindingHash?: Hex },
    ): PlatformInjections;
    /** Parse the JSON returned by `window.tlsn.execCode(code)` into a typed result. */
    parsePluginResult(json: string): PluginResult;
}

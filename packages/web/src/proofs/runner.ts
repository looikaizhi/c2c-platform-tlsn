import type { Hex } from 'viem';
import type { PaymentPlatform, PluginResult } from '@/platforms/types';
import {
    computeOrderBindingHash,
    type OrderBindingContext,
} from './transformer';

// `window.tlsn` is declared globally in src/types/tlsn.d.ts.

/**
 * Load + execute a plugin in the TLSN extension's QuickJS sandbox.
 *
 * Replaces the platform-specific `runWisePlugin` / `runAlipayPlugin` flows:
 * marker injection is driven by `platform.buildInjections`, return parsing
 * by `platform.parsePluginResult`, so adding a new platform is one file.
 *
 * @param extra.transferContext  required for dual-proof platforms (Wise);
 *                               used to compute the transferBindingHash
 *                               injected into the plugin.
 */
export async function runPlugin(
    platform: PaymentPlatform,
    ctx: OrderBindingContext,
    extra?: { transferContext?: OrderBindingContext },
): Promise<PluginResult> {
    if (typeof window === 'undefined' || !window.tlsn?.execCode) {
        throw new Error('TLSN extension not found. Please install the TLSNotary extension.');
    }

    const pluginCode = await fetch(platform.pluginUrl).then((r) => {
        if (!r.ok) throw new Error(`Failed to load plugin ${platform.pluginUrl}: ${r.status}`);
        return r.text();
    });

    const transferBindingHash: Hex | undefined =
        platform.proofShape === 'dual' && extra?.transferContext
            ? computeOrderBindingHash(extra.transferContext)
            : undefined;

    if (platform.proofShape === 'dual' && !transferBindingHash) {
        throw new Error(`Platform ${platform.key} (dual) requires extra.transferContext`);
    }

    const injections = platform.buildInjections(ctx, { transferBindingHash });
    let code = pluginCode;
    for (const [marker, value] of Object.entries(injections)) {
        code = code.split(marker).join(value);
    }

    const resultJson = await window.tlsn.execCode(code);
    return platform.parsePluginResult(resultJson);
}

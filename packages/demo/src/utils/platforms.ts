// packages/demo/src/utils/platforms.ts
//
// PlatformAdapter — single registry of supported payment platforms, plus the
// adapter-driven plugin runner used by the upcoming PaymentPlatform refactor.
//
// Adding a new payment platform = add an adapter object + one Map.set() line
// below; nothing else in the codebase changes (panels iterate listAdapters()).
//
// Phase 3 scope (plan §3, option A): this file defines adapter / registry /
// runner. The legacy wise/alipay actions files keep their own PLATFORM_WISE /
// PLATFORM_ALIPAY consts (same byte value, different file) until Phase 7d
// deletes them. Panels are migrated piece-by-piece during Phase 6.

import { keccak256, stringToBytes } from 'viem';
import type { Hex } from 'viem';
import {
  computeOrderBindingHash,
  injectPluginContext,
  injectTransferOrderBindingHash,
  type OrderBindingContext,
  type ExtensionProveResponse,
} from './proof';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PlatformId = Hex;

export type PlatformProof =
  | {
      shape: 'single';
      data: ExtensionProveResponse;
    }
  | {
      shape: 'contacts+transfer';
      data: {
        contacts: ExtensionProveResponse;
        transfer: ExtensionProveResponse;
      };
    };

export interface PlatformAdapter {
  readonly id: PlatformId;
  readonly tenantId: 'wise' | 'alipay' | string;
  readonly label: string;
  readonly currency: string;
  readonly defaultProductId: bigint;
  readonly pluginUrl: string;
  readonly proofShape: 'single' | 'contacts+transfer';
  /**
   * Secondary injector applied AFTER injectPluginContext.
   * Wise uses this to also inject TRANSFER_ORDER_BINDING_HASH (separate from
   * the primary ORDER_BINDING_HASH sentinel). Alipay leaves it unset.
   */
  injectExtra?(code: string, ctx: OrderBindingContext): string;
}

// ─── Wise adapter ────────────────────────────────────────────────────────────

export const wiseAdapter: PlatformAdapter = {
  id:               keccak256(stringToBytes('wise')) as PlatformId,
  tenantId:         'wise',
  label:            'Wise',
  currency:         'MYR',
  defaultProductId: 0n,
  pluginUrl:        '/plugins/wise.js',
  proofShape:       'contacts+transfer',
  injectExtra(code, ctx) {
    return injectTransferOrderBindingHash(code, computeOrderBindingHash(ctx));
  },
};

// ─── Alipay adapter ──────────────────────────────────────────────────────────

export const alipayAdapter: PlatformAdapter = {
  id:               keccak256(stringToBytes('alipay')) as PlatformId,
  tenantId:         'alipay',
  label:            'Alipay',
  currency:         'CNY',
  defaultProductId: 1n,
  pluginUrl:        '/plugins/alipay.js',
  proofShape:       'single',
};

// ─── Registry ────────────────────────────────────────────────────────────────

const adapters = new Map<PlatformId, PlatformAdapter>([
  [wiseAdapter.id,   wiseAdapter],
  [alipayAdapter.id, alipayAdapter],
]);

export function getAdapter(id: PlatformId): PlatformAdapter {
  const a = adapters.get(id);
  if (!a) throw new Error(`Unsupported platform: ${id}`);
  return a;
}

export function tryGetAdapter(id: PlatformId): PlatformAdapter | undefined {
  return adapters.get(id);
}

export function listAdapters(): PlatformAdapter[] {
  return [...adapters.values()];
}

// Legacy alias exports — same byte value as wise/alipay actions' own
// PLATFORM_WISE / PLATFORM_ALIPAY consts. After Phase 7d those go away and
// this file is the single source of truth for platform ids.
export const PLATFORM_WISE   = wiseAdapter.id;
export const PLATFORM_ALIPAY = alipayAdapter.id;

// ─── Plugin runner ───────────────────────────────────────────────────────────

/**
 * Fetch the adapter's plugin source, inject ctx + adapter-specific extras,
 * execute via the TLSN extension's QuickJS sandbox, and shape the result
 * into a PlatformProof tagged with `shape`. Consumers pattern-match on
 * `result.shape` to know whether they got one proof or two.
 */
export async function runPaymentPlugin(
  adapter: PlatformAdapter,
  ctx: OrderBindingContext,
): Promise<PlatformProof> {
  if (!window.tlsn?.execCode) throw new Error('TLSN extension not found.');

  let code = await fetch(adapter.pluginUrl).then((r) => r.text());
  code = injectPluginContext(code, ctx);
  if (adapter.injectExtra) code = adapter.injectExtra(code, ctx);

  const result = JSON.parse(await window.tlsn.execCode(code));
  return adapter.proofShape === 'contacts+transfer'
    ? { shape: 'contacts+transfer', data: result.proofs }
    : { shape: 'single',            data: result };
}

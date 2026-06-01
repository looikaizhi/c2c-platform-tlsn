import type { Hex } from 'viem';
import type { PaymentPlatform } from './types';
import { wise } from './wise';
import { alipay } from './alipay';

export const allPlatforms: readonly PaymentPlatform[] = [wise, alipay] as const;

const byKey = new Map<PaymentPlatform['key'], PaymentPlatform>(
    allPlatforms.map((p) => [p.key, p]),
);
const byId = new Map<string, PaymentPlatform>(
    allPlatforms.map((p) => [p.id.toLowerCase(), p]),
);

export function platformByKey(key: PaymentPlatform['key']): PaymentPlatform {
    const p = byKey.get(key);
    if (!p) throw new Error(`Unknown platform key: ${key}`);
    return p;
}

export function platformById(id: Hex): PaymentPlatform {
    const p = byId.get(id.toLowerCase());
    if (!p) throw new Error(`Unknown platform id: ${id}`);
    return p;
}

/** Convenience re-exports of the platform id sentinels — same values as
 *  `platformByKey('wise').id` and `platformByKey('alipay').id`, kept for
 *  call sites still using bare constants. */
export const PLATFORM_WISE:   Hex = wise.id;
export const PLATFORM_ALIPAY: Hex = alipay.id;

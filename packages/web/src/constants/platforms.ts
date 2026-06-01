import { keccak256, toBytes } from 'viem';

export const PLATFORM_WISE = keccak256(toBytes('wise')) as `0x${string}`;
export const PLATFORM_ALIPAY = keccak256(toBytes('alipay')) as `0x${string}`;

export const PLATFORMS = {
    wise: { id: PLATFORM_WISE, label: 'Wise', icon: 'wise' },
    alipay: { id: PLATFORM_ALIPAY, label: 'Alipay', icon: 'alipay' },
} as const;

export type PlatformKey = keyof typeof PLATFORMS;

/** Shared display config for a product/order's platformId. Returns null for unknown ids. */
export function platformDisplay(id: string | null | undefined): { key: PlatformKey; label: string; color: string; bg: string } | null {
    if (id === PLATFORM_WISE)   return { key: 'wise',   label: 'Wise',   color: '#7DD3FC', bg: 'rgba(125,211,252,0.12)' };
    if (id === PLATFORM_ALIPAY) return { key: 'alipay', label: 'Alipay', color: '#5EEAD4', bg: 'rgba(94,234,212,0.12)' };
    return null;
}

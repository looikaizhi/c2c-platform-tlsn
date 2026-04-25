import { keccak256, toBytes } from 'viem';

export const PLATFORM_WISE = keccak256(toBytes('wise')) as `0x${string}`;
export const PLATFORM_ALIPAY = keccak256(toBytes('alipay')) as `0x${string}`;

export const PLATFORMS = {
    wise: { id: PLATFORM_WISE, label: 'Wise', icon: 'wise' },
    alipay: { id: PLATFORM_ALIPAY, label: 'Alipay', icon: 'alipay' },
} as const;

export type PlatformKey = keyof typeof PLATFORMS;

import { DEFAULT_CRYPTO, DEFAULT_MONEY, getDefaultOptions } from '@/lib/priceModel';
import type { Region } from '@/interface/tradingPage';

export const MONEY_OPTIONS = getDefaultOptions(DEFAULT_MONEY);
export const CRYPTO_OPTIONS = getDefaultOptions(DEFAULT_CRYPTO);

export const REGION_OPTIONS: Record<string, Region> = {
    TW: { name: '台湾', img: 'https://flagcdn.com/tw.svg' },
    HK: { name: '香港', img: 'https://flagcdn.com/hk.svg' },
    SG: { name: '新加坡', img: 'https://flagcdn.com/sg.svg' },
    JP: { name: '日本', img: 'https://flagcdn.com/jp.svg' },
    US: { name: '美国', img: 'https://flagcdn.com/us.svg' },
};

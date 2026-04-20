import { Plugin } from './types';

export const plugins: Record<string, Plugin> = {
    alipay: {
        name: 'Alipay Login Account',
        description: 'Prove Alipay merchant logonName and masterCustomerId',
        logo: '💰',
        file: '/plugins/alipay.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value
        },
    },
    binance: {
        name: 'Binance KYC Status',
        description: 'Prove your Binance KYC status with selective disclosure',
        logo: 'BNB',
        file: '/plugins/binance.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value;
        },
    },
    wise: {
        name: 'Wise Transfer',
        description: 'Prove your Wise transfer response.',
        logo: 'WISE',
        file: '/plugins/wise.js',
        parseResult: (json: any) => {
            // wise plugin returns {displayResults, proofs} instead of {results}
            const results = json.displayResults || json.results || [];
            return results.length ? results[results.length - 1].value : 'Proof generated successfully';
        },
    },
};

import { createConfig, http, cookieStorage, createStorage, type CreateConnectorFn } from 'wagmi';
import { hardhat, sepolia, arbitrumSepolia, arbitrum } from 'wagmi/chains';
import { injected, walletConnect } from '@wagmi/connectors';

const WC_DISABLED = process.env.NEXT_PUBLIC_DISABLE_WC === 'true';
const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

if (!WC_DISABLED && !wcProjectId) {
    throw new Error(
        '[wagmiConfig] NEXT_PUBLIC_WC_PROJECT_ID is required (or set ' +
        'NEXT_PUBLIC_DISABLE_WC=true for injected-only mode). ' +
        'Get one at https://cloud.reown.com',
    );
}

const connectors: CreateConnectorFn[] = [injected({ shimDisconnect: true })];
if (!WC_DISABLED) {
    connectors.push(
        walletConnect({
            projectId: wcProjectId!,
            metadata: {
                name:        process.env.NEXT_PUBLIC_APP_NAME ?? 'zkTLS C2C',
                description: 'Semi-decentralized C2C exchange',
                url:         process.env.NEXT_PUBLIC_APP_URL  ?? 'http://localhost:3001',
                icons:       [],
            },
            showQrModal: true,
        }),
    );
}

export const wagmiConfig = createConfig({
    chains: [hardhat, sepolia, arbitrumSepolia, arbitrum],
    transports: {
        [hardhat.id]:         http(),
        [sepolia.id]:         http(),
        [arbitrumSepolia.id]: http(),
        [arbitrum.id]:        http(),
    },
    connectors,
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
});

declare module 'wagmi' {
    interface Register {
        config: typeof wagmiConfig;
    }
}

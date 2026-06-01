"use client";
import { WagmiProvider, type State } from 'wagmi';
import { wagmiConfig } from '@/chain/wagmiConfig';
import AppQueryProvider from './AppQueryProvider';

export default function Web3Provider({
    children,
    initialState,
}: {
    children:      React.ReactNode;
    initialState?: State;
}) {
    return (
        <WagmiProvider config={wagmiConfig} initialState={initialState}>
            <AppQueryProvider>{children}</AppQueryProvider>
        </WagmiProvider>
    );
}

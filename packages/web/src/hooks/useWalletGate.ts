"use client";
import { useState, useCallback } from 'react';
import { useWallet } from '@/hooks/useWallet';

export function useWalletGate() {
    const { isConnected } = useWallet();
    const [showModal, setShowModal] = useState(false);

    const requireWallet = useCallback(
        async <T>(fn: () => Promise<T>): Promise<T | void> => {
            if (!isConnected) {
                setShowModal(true);
                return;
            }
            return fn();
        },
        [isConnected],
    );

    const closeModal = useCallback(() => setShowModal(false), []);

    return { requireWallet, showModal, closeModal };
}

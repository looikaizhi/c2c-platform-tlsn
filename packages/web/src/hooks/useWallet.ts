"use client";
// Transitional shim — wallet state now lives in @/hooks/domain/useWallet,
// backed by wagmi. This re-export keeps the existing `@/hooks/useWallet`
// import path working for the ~13 call sites across the app.
// Removed in Stage P9.
export { useWallet, type UseWalletReturn as WalletState } from '@/hooks/domain/useWallet';

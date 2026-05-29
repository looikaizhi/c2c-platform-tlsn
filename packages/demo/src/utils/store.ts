// packages/demo/src/utils/store.ts
//
// In-memory UI state stores (zustand 4.x). ALL three stores are intentionally
// configured without the persist middleware — refresh-resets-tab-selection is
// the pre-Phase-5 behavior and must be preserved exactly (§4.7, §11, §13 C10).
//
// The console store is seeded with the EXACT message App.tsx used to put in
// its initial useState<ConsoleEntry[]>; keeping them byte-identical makes the
// Phase 5 wire-up a pure behavior-preserving move (§4.7 + §11).

import { create } from 'zustand';
import type { ConsoleEntry } from '../types';
import { formatTimestamp } from '../utils';

// ─── UI tabs ────────────────────────────────────────────────────────────────

interface UiState {
  selectedUserIdx:     number;
  selectedMerchantIdx: number;
  setUserIdx:     (i: number) => void;
  setMerchantIdx: (i: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedUserIdx:     0,
  selectedMerchantIdx: 0,
  setUserIdx:     (i) => set({ selectedUserIdx: i }),
  setMerchantIdx: (i) => set({ selectedMerchantIdx: i }),
}));

// ─── Toast ──────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info';

export interface ToastEntry {
  id:   string;
  type: ToastType;
  msg:  string;
}

interface ToastState {
  toasts:  ToastEntry[];
  push:    (type: ToastType, msg: string) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (type, msg) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        { id: String(Date.now() + Math.random()), type, msg },
      ],
    })),
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// ─── Console (seed matches App.tsx pre-Phase-5 useState initial value) ──────

interface ConsoleState {
  entries: ConsoleEntry[];
  append: (message: string, type?: ConsoleEntry['type']) => void;
  clear:  () => void;
}

const SEED_MESSAGE =
  '💡 TLSNotary C2C Demo — deploy contracts with the Deploy Panel, then use the Trading Hall.';

export const useConsoleStore = create<ConsoleState>((set) => ({
  entries: [
    { timestamp: formatTimestamp(), message: SEED_MESSAGE, type: 'info' },
  ],
  append: (msg, type = 'info') =>
    set((s) => ({
      entries: [
        ...s.entries,
        { timestamp: formatTimestamp(), message: msg, type },
      ],
    })),
  clear: () =>
    set({
      entries: [
        { timestamp: formatTimestamp(), message: 'Console cleared', type: 'info' },
      ],
    }),
}));

import type { Hex } from 'viem';
import type { PlaceOrderSuccessResult, SelectedOrderInfo } from './types';

export type OrderLifecyclePhase = 'idle' | 'place-order' | 'awaiting-proof';

export interface OrderLifecycleState {
    phase: OrderLifecyclePhase;
    selectedInfo: SelectedOrderInfo | null;
    onChainOrderId: bigint;
    fiatAmount: number | null;
    deadline: bigint;
    platformId: Hex | null;
}

export type OrderLifecycleEvent =
    | { type: 'ORDER_SELECTED'; payload: SelectedOrderInfo }
    | { type: 'ORDER_CREATED'; payload: PlaceOrderSuccessResult }
    | { type: 'FLOW_RESET' };

export const initialOrderLifecycleState: OrderLifecycleState = {
    phase: 'idle',
    selectedInfo: null,
    onChainOrderId: 0n,
    fiatAmount: null,
    deadline: 0n,
    platformId: null,
};

export function orderLifecycleReducer(
    state: OrderLifecycleState,
    event: OrderLifecycleEvent,
): OrderLifecycleState {
    switch (event.type) {
        case 'ORDER_SELECTED':
            return {
                phase: 'place-order',
                selectedInfo: event.payload,
                onChainOrderId: 0n,
                fiatAmount: null,
                deadline: 0n,
                platformId: null,
            };
        case 'ORDER_CREATED':
            if (!state.selectedInfo) return state;
            return {
                phase: 'awaiting-proof',
                selectedInfo: state.selectedInfo,
                onChainOrderId: event.payload.orderId,
                fiatAmount: event.payload.fiatAmount,
                deadline: event.payload.deadline,
                platformId: event.payload.platformId,
            };
        case 'FLOW_RESET':
            return initialOrderLifecycleState;
        default:
            return state;
    }
}

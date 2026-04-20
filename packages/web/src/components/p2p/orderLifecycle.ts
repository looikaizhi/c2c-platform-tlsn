import type { PlaceOrderSuccessResult, SelectedOrderInfo } from './types';

export type OrderLifecyclePhase = 'idle' | 'place-order' | 'payment';

export interface OrderLifecycleState {
    phase: OrderLifecyclePhase;
    selectedInfo: SelectedOrderInfo | null;
    onChainOrderId: bigint;
    fiatAmount: number | null;
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
            };
        case 'ORDER_CREATED':
            if (!state.selectedInfo) return state;
            return {
                phase: 'payment',
                selectedInfo: state.selectedInfo,
                onChainOrderId: event.payload.orderId,
                fiatAmount: event.payload.fiatAmount,
            };
        case 'FLOW_RESET':
            return initialOrderLifecycleState;
        default:
            return state;
    }
}

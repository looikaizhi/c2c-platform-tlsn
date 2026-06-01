import { apiFetch } from '../http';
import {
    ENDPOINTS,
    type OrderDetail,
    type OrderList,
    type OrderListRequest,
    type OrderPayment,
    type OrderPaymentRequest,
} from '../endpoints';

export const orderApi = {
    list: (body: OrderListRequest) =>
        apiFetch<OrderList[]>(ENDPOINTS.orderList, { method: 'POST', body }),

    payment: (body: OrderPaymentRequest) =>
        apiFetch<OrderPayment[]>(ENDPOINTS.orderPayment, { method: 'POST', body }),

    detail: (orderId: string) =>
        apiFetch<OrderDetail | null>(ENDPOINTS.orderDetail(orderId)),
};

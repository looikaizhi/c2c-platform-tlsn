/**
 * Client-side API helpers. All routes are relative (same-origin).
 */
import * as dbTypes from '@/server/db_types';

export const fetchUsersDashboard = async (req: dbTypes.UserDashboardRequest) => {
    try {
        const res = await fetch('/api/dashboard/userDashboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok) throw new Error(`Failed to fetch users dashboard: ${res.status}`);
        const data: dbTypes.UserDashboard[] = await res.json();
        return data;
    } catch (error) {
        console.error(error);
    }
};

export const fetchOrderList = async (req: dbTypes.OrderListRequest) => {
    try {
        const res = await fetch('/api/order/allOrder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok) throw new Error(`Failed to fetch order list: ${res.status}`);
        const data: dbTypes.OrderList[] = await res.json();
        return data;
    } catch (error) {
        console.error(error);
    }
};

export const fetchOrderPayment = async (req: dbTypes.OrderPaymentRequest) => {
    try {
        const res = await fetch('/api/order/orderPayment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok) throw new Error(`Failed to fetch order payment method: ${res.status}`);
        const data: dbTypes.OrderPayment[] = await res.json();
        return data;
    } catch (error) {
        console.error(error);
    }
};

export const fetchOrderDetail = async (orderId: string) => {
    try {
        const res = await fetch(`/api/order/detail?orderId=${encodeURIComponent(orderId)}`);
        if (!res.ok) throw new Error(`Failed to fetch order detail: ${res.status}`);
        const data: dbTypes.OrderDetail | null = await res.json();
        return data;
    } catch (error) {
        console.error(error);
    }
};

/**
 * Fetch price rate from server-side API route.
 */
export const fetchRate = async (moneyPair: string, cryptoPair: string): Promise<number | null> => {
    try {
        const res = await fetch(`/api/price?money=${moneyPair}&crypto=${cryptoPair}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.rate ?? null;
    } catch {
        return null;
    }
};

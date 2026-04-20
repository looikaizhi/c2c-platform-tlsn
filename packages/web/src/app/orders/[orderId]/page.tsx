import OrderDetailPageClient from '@/components/orders/OrderDetailPageClient';

interface OrderDetailPageProps {
    params: Promise<{
        orderId: string;
    }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
    const { orderId } = await params;
    return <OrderDetailPageClient orderId={orderId} />;
}

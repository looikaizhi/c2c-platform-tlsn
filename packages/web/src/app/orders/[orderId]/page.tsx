import OrderDetailPageClient from '@/components/orders/OrderDetailPageClient';

interface OrderDetailPageProps {
    params: {
        orderId: string;
    };
}

export default function OrderDetailPage({ params }: OrderDetailPageProps) {
    return <OrderDetailPageClient orderId={params.orderId} />;
}

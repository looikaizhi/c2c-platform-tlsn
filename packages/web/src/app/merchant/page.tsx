import dynamic from 'next/dynamic';

const MerchantPanel = dynamic(() => import('@/components/MerchantPanel'));

export default function MerchantPage() {
    return <MerchantPanel />;
}

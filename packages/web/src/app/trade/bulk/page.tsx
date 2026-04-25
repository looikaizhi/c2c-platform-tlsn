import { TradingLayout } from '@/components/layout/TradingLayout';
import BulkPage from '@/components/trade/BulkPage';

export default function BulkTradeRoute() {
  return (
    <TradingLayout activeTab="bulk">
      <BulkPage />
    </TradingLayout>
  );
}

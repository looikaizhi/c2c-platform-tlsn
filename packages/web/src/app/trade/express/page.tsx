import { TradingLayout } from '@/components/layout/TradingLayout';
import { ExpressPage } from '@/components/trade/ExpressPage';

export default function ExpressTradeRoute() {
  return (
    <TradingLayout activeTab="express">
      <ExpressPage />
    </TradingLayout>
  );
}

import { TradingLayout } from '@/components/layout/TradingLayout';
import { ExpressPage } from '@/components/trading/ExpressPage';

export default function ExpressTradeRoute() {
  return (
    <TradingLayout activeTab="express">
      <ExpressPage />
    </TradingLayout>
  );
}

import { TradingLayout } from '@/components/layout/TradingLayout';
import { P2PPage } from '@/components/trading/P2PPage';

export default function P2PTradeRoute() {
  return (
    <TradingLayout activeTab="p2p">
      <P2PPage />
    </TradingLayout>
  );
}

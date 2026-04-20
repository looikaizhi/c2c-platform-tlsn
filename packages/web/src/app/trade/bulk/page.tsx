import TradingPage from "@/components/TradingPage";
import BulkPage from "@/components/trade/BulkPage";
import { TradingType } from "@/interface/tradingPage";

export default function BulkTradeRoute() {
  return (
    <TradingPage activeMode={TradingType.Bulk}>
      <BulkPage />
    </TradingPage>
  );
}

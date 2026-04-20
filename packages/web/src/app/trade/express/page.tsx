import TradingPage from "@/components/TradingPage";
import ExpressPage from "@/components/ExpressPage";
import { TradingType } from "@/interface/tradingPage";

export default function ExpressTradeRoute() {
  return (
    <TradingPage activeMode={TradingType.EXPRESS}>
      <ExpressPage />
    </TradingPage>
  );
}

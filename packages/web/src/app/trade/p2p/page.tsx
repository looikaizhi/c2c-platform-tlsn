import TradingPage from "@/components/TradingPage";
import { P2P_Page } from "@/components/P2P_Page";
import { TradingType } from "@/interface/tradingPage";

export default function P2PTradeRoute() {
  return (
    <TradingPage activeMode={TradingType.P2P}>
      <P2P_Page />
    </TradingPage>
  );
}

"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ChevronDown, CircleEllipsis, FileText, MessageSquareText, UserRound } from "lucide-react";
import { TradingType } from "@/interface/tradingPage";

const TRADE_ROUTES: Record<TradingType, string> = {
  [TradingType.EXPRESS]: "/trade/express",
  [TradingType.P2P]: "/trade/p2p",
  [TradingType.Bulk]: "/trade/bulk",
};

const MODE_LABEL: Record<TradingType, string> = {
  [TradingType.EXPRESS]: "Express",
  [TradingType.P2P]: "P2P",
  [TradingType.Bulk]: "Block",
};

interface TradingPageProps {
  activeMode: TradingType;
  children: React.ReactNode;
}

export default function TradingPage({ activeMode, children }: TradingPageProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const quickActionWrapClass = "relative flex h-full shrink-0 items-center";
  const quickActionInnerClass = "relative flex h-full items-center";
  const quickActionLinkClass =
    "flex items-center gap-1.5 no-underline text-[14px] font-medium leading-none text-[var(--color-SecondaryText)] transition-colors hover:text-white";
  const quickActionTooltipClass = "pointer-events-none absolute left-0 top-full hidden";
  const tooltipStyle: CSSProperties = {
    transform: "translate(0px, 0px)",
    top: "100%",
    left: "0px",
  };
  const themeRootStyle: CSSProperties = {
    "--color-BasicBg": "#181A20",
    "--color-SecondaryBg": "#0B0E11",
    "--color-Input": "#29313D",
    "--color-InputLine": "#434C5A",
    "--color-CardBg": "#202630",
    "--color-Vessel": "#29313D",
    "--color-Line": "#333B47",
    "--color-DisableBtn": "#29313D",
    "--color-DisableText": "#4F5867",
    "--color-TertiaryText": "#707A8A",
    "--color-SecondaryText": "#929AA5",
    "--color-PrimaryText": "#EAECEF",
    "--color-RedGreenBgText": "#FFFFFF",
    "--color-EmphasizeText": "#FF693D",
    "--color-TextOnGray": "#EAECEF",
    "--color-TextOnYellow": "#202630",
    "--color-IconNormal": "#707A8A",
    "--color-LiteBg1": "#202630",
    "--color-LiteBg2": "#191A1F",
    "--color-BtnBg": "#FCD535",
    "--color-PrimaryYellow": "#F0B90B",
    "--color-TextLink": "#F0B90B",
    "--color-TradeBg": "#0B0E11",
    "--color-TextToast": "#F0B90B",
    "--color-DepthSellBg": "#35141D",
    "--color-SellHover": "#F6465D",
    "--color-Sell": "#F6465D",
    "--color-DepthBuyBg": "#102821",
    "--color-BuyHover": "#2EBD85",
    "--color-Buy": "#2EBD85",
    "--color-TextBuy": "#2EBD85",
    "--color-Error": "#F6465D",
    "--color-SuccessBg": "#102821",
    "--color-Success": "#2EBD85",
    "--color-TagBg": "#434C5A",
    "--color-Grid": "#333B47",
    "--color-Placeholder": "#434C5A",
    "--color-TwoColorIcon": "#CACED3",
    "--color-ErrorBg": "rgba(246, 70, 93, 0.1)",
    "--color-BadgeBg": "rgba(240, 185, 11, 0.1)",
    "--color-Popup": "#333B47",
    "--color-Mask": "rgba(11, 14, 17, 0.6)",
    "--color-WidgetSecondaryBg": "rgba(195, 207, 240, 0.08)",
    "--color-WidgetSurface": "rgba(195, 207, 240, 0.06)",
    "--color-WidgetSurface2": "rgba(122, 148, 178, 0.12)",
    "--color-ContainerBg": "#29313D",
    "--color-YellowAlpha01": "rgba(252, 213, 53, 0.1)",
    "--color-YellowAlpha02": "rgba(252, 213, 53, 0.2)",
    "--color-RedAlpha01": "rgba(246, 70, 93, 0.1)",
    "--color-RedAlpha02": "rgba(246, 70, 93, 0.2)",
    "--color-GreenAlpha01": "rgba(46, 189, 133, 0.1)",
    "--color-GreenAlpha02": "rgba(46, 189, 133, 0.2)",
    "--color-ChatBg": "#1A1E25",
    "--color-LineAlpha": "rgba(193, 204, 219, 0.08)",
    "--color-WidgetPrimaryBg": "rgba(122, 148, 178, 0.08)",
    "--color-ChatBubble": "#29313D",
    "--color-ChatBubble2": "#2D3E59",
    "--color-ChatInput": "rgba(41, 49, 61, 0.95)",
    "--color-ChatName": "#F0B90B",
    "--color-ChatCard": "#30222B",
    "--color-ChatCard2": "#243042",
    "--color-ParagraphText": "#EAECEF",
    "--color-CheckboxFillDefault": "#DFDFDF",
    "--color-CheckboxBorder": "rgba(255, 255, 255, 0.3)",
  } as CSSProperties;

  return (
    <section className="theme-root dark h-full w-full" style={themeRootStyle}>
      <div style={{ position: "relative" }} />
      <div className="scroll-container h-full [&>div]:flex-shrink-0 [&>footer]:pt-[60px] [&>header]:flex-shrink-0 css-vurnku">
        <main className="main-content css-vurnku">
          <div className="relative top-0 w-full border-b border-[var(--color-Line)] bg-[color:rgb(24_26_32_/_96%)]">
            <div
              className="grid h-12 w-full grid-cols-[1fr_auto] items-center gap-5 px-4 sm:px-6"
              style={{ maxWidth: "1280px", marginInline: "auto" }}
            >
              <div className="relative flex h-full items-center">
                <div className="flex h-full flex-grow items-center">
                  <div className="flex h-full items-center">
                    <div
                      role="tablist"
                      aria-orientation="horizontal"
                      aria-label="Trade Modes"
                      className="flex h-full items-end gap-7"
                    >
                      {Object.values(TradingType).map((type, index) => {
                        const active = type === activeMode;
                        return (
                          <Link
                            key={type}
                            href={TRADE_ROUTES[type]}
                            id={`bn-tab-${index}`}
                            aria-controls={`bn-tab-pane-${index}`}
                            role="tab"
                            tabIndex={active ? 0 : -1}
                            aria-selected={active}
                            aria-current={active ? "page" : undefined}
                            className={`inline-flex h-full items-center border-b-[3px] pb-[8px] text-[16px] font-medium transition-all duration-[var(--motion-fast)] focus-visible:border-[color:rgb(240_185_11_/_60%)] focus-visible:outline-none focus-visible:text-white ${
                              active
                                ? "border-[var(--color-PrimaryYellow)] text-white"
                                : "border-transparent text-[var(--color-SecondaryText)] hover:border-[color:rgb(240_185_11_/_45%)] hover:text-white"
                            }`}
                          >
                            <div className="flex items-center">{MODE_LABEL[type]}</div>
                          </Link>
                        );
                      })}
                    </div>
                    <div className="hidden" />
                  </div>
                </div>
              </div>

              <div className="hidden h-full items-center justify-end gap-5 lg:flex">
                <div className={quickActionWrapClass}>
                  <div className={quickActionInnerClass}>
                    <div className="bn-tooltips-ele" aria-describedby="bn-tooltips-orders">
                      <div className="flex items-center">
                        <Link title="Orders" href="/dashboard" className={quickActionLinkClass}>
                          <div className="flex items-center">
                            <div className="flex">
                              <FileText className="bn-svg h-[18px] w-[18px]" />
                            </div>
                            <div className="ml-1">Orders</div>
                          </div>
                        </Link>
                      </div>
                    </div>
                    <div
                      role="tooltip"
                      tabIndex={0}
                      id="bn-tooltips-orders"
                      className={quickActionTooltipClass}
                      style={tooltipStyle}
                    />
                  </div>
                </div>
                <div className={quickActionWrapClass}>
                  <div className={quickActionInnerClass}>
                    <div className="bn-tooltips-ele" aria-describedby="bn-tooltips-chat">
                      <div className="flex items-center">
                        <a
                          title="Chat"
                          href="/en/chatroom"
                          target="_self"
                          className={quickActionLinkClass}
                        >
                          <div className="flex items-center">
                            <div className="flex">
                              <MessageSquareText className="bn-svg h-[18px] w-[18px]" />
                            </div>
                            <div className="ml-1">Chat</div>
                          </div>
                        </a>
                      </div>
                    </div>
                    <div
                      role="tooltip"
                      tabIndex={0}
                      id="bn-tooltips-chat"
                      className={quickActionTooltipClass}
                      style={tooltipStyle}
                    />
                  </div>
                </div>
                <div className={quickActionWrapClass}>
                  <div className={quickActionInnerClass}>
                    <div className="bn-tooltips-ele" aria-describedby="bn-tooltips-user-center">
                      <div className="flex items-center">
                        <Link
                          title="User Center"
                          data-linktype="userCenter"
                          data-icon="user-round"
                          href="/merchant"
                          target="_self"
                          className={quickActionLinkClass}
                        >
                          <div className="flex items-center">
                            <div className="flex">
                              <UserRound className="bn-svg h-[18px] w-[18px]" />
                            </div>
                            <div className="ml-1">User Center</div>
                          </div>
                        </Link>
                      </div>
                    </div>
                    <div
                      role="tooltip"
                      tabIndex={0}
                      id="bn-tooltips-user-center"
                      className={quickActionTooltipClass}
                      style={tooltipStyle}
                    />
                  </div>
                </div>
                <div className={quickActionWrapClass}>
                  <div className={`${quickActionInnerClass} relative`}>
                    <div className="bn-tooltips-ele" aria-describedby="bn-tooltips-more">
                      <div className="flex items-center">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setIsMoreOpen((prev) => !prev)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setIsMoreOpen((prev) => !prev);
                            }
                          }}
                          aria-expanded={isMoreOpen}
                          aria-haspopup="menu"
                          className={quickActionLinkClass}
                        >
                          <div className="flex items-center">
                            <div className="flex">
                              <CircleEllipsis className="bn-svg h-[18px] w-[18px]" />
                            </div>
                            <div className="ml-1">More</div>
                            <ChevronDown
                              className={`bn-svg ml-2 text-[var(--text-primary)] transition-transform duration-[var(--motion-fast)] ${
                                isMoreOpen ? "rotate-180" : "rotate-0"
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div
                      role="tooltip"
                      tabIndex={0}
                      id="bn-tooltips-more"
                      className={quickActionTooltipClass}
                      style={tooltipStyle}
                    />
                    {isMoreOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 top-full z-40 mt-2 w-40 rounded-md border border-[var(--color-Line)] bg-[#1E2329] p-1.5 shadow-2xl"
                      >
                        <a
                          href="#"
                          role="menuitem"
                          className="block rounded-md px-3 py-2 text-sm text-[var(--color-SecondaryText)] transition-colors hover:bg-[#2B3139] hover:text-white"
                        >
                          Help 帮助
                        </a>
                        <a
                          href="#"
                          role="menuitem"
                          className="block rounded-md px-3 py-2 text-sm text-[var(--color-SecondaryText)] transition-colors hover:bg-[#2B3139] hover:text-white"
                        >
                          Support 支持
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full" style={{ maxWidth: "1280px", marginInline: "auto" }}>
            {children}
          </div>
        </main>
      </div>
    </section>
  );
}

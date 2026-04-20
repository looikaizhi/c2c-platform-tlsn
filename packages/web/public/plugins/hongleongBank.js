const VERIFIER_URL = "http://localhost:7047";
const PROXY_URL_BASE = "ws://localhost:7047/proxy?token=";
const HOST = "s.hongleongconnect.my";
const PATH = "/rib/app/fo/trx/hist";
const MATCH_URL_PREFIX = `https://${HOST}${PATH}`;
const LANDING_URL = "https://s.hongleongconnect.my/rib/app/fo/main";
const METHOD = "POST";
const config = {
  name: "Hong Leong Bank Prover",
  description: "Prove your Hong Leong Bank account balance.",
  requests: [
    {
      method: METHOD,
      host: HOST,
      pathname: PATH,
      verifierUrl: VERIFIER_URL
    }
  ],
  urls: [`https://${HOST}/*`]
};
function getHeaderValue(header, name) {
  return header?.requestHeaders?.find(
    (h) => h?.name?.toLowerCase() === name.toLowerCase()
  )?.value || null;
}
async function onClick() {
  console.log("[hongleong] onClick start");
  try {
    const isRequestPending = useState("isRequestPending", false);
    if (isRequestPending) return;
    setState("isRequestPending", true);
    const requestUrl = useState("requestUrl", null);
    const cachedCookie = useState("cookie", null);
    const cachedContentType = useState("content-type", null);
    const cachedFacesRequest = useState("faces-request", null);
    const cachedOrigin = useState("origin", null);
    const cachedReferer = useState("referer", null);
    const cachedAccept = useState("accept", null);
    const cachedAcceptLanguage = useState("accept-language", null);
    const cachedUserAgent = useState("user-agent", null);
    const cachedPragma = useState("pragma", null);
    const cachedCacheControl = useState("cache-control", null);
    const missing = [];
    if (!requestUrl) missing.push("request url");
    if (!cachedCookie) missing.push("cookie");
    if (!cachedContentType) missing.push("content-type");
    if (!cachedFacesRequest) missing.push("faces-request");
    if (!cachedOrigin) missing.push("origin");
    if (!cachedReferer) missing.push("referer");
    if (missing.length > 0) {
      console.log("[hongleong] missing captured values", missing);
      setState("isRequestPending", false);
      return;
    }
    const headers = {
      cookie: cachedCookie,
      "content-type": cachedContentType,
      "faces-request": cachedFacesRequest,
      origin: cachedOrigin,
      referer: cachedReferer,
      Host: HOST,
      "Accept-Encoding": "identity",
      Connection: "close"
    };
    if (cachedAccept) headers.accept = cachedAccept;
    if (cachedAcceptLanguage) {
      headers["accept-language"] = cachedAcceptLanguage;
    }
    if (cachedUserAgent) headers["user-agent"] = cachedUserAgent;
    if (cachedPragma) headers.pragma = cachedPragma;
    if (cachedCacheControl) headers["cache-control"] = cachedCacheControl;
    const resp = await prove(
      {
        url: requestUrl,
        method: METHOD,
        headers
      },
      {
        verifierUrl: VERIFIER_URL,
        proxyUrl: PROXY_URL_BASE + HOST,
        maxRecvData: 2e4,
        maxSentData: 12e3,
        handlers: [
          { type: "SENT", part: "ALL", action: "REVEAL" },
          { type: "RECV", part: "START_LINE", action: "REVEAL" },
          { type: "RECV", part: "BODY", action: "REVEAL" }
        ]
      }
    );
    console.log("[hongleong] prove ok");
    done(JSON.stringify(resp));
  } catch (err) {
    console.error("[hongleong] onClick error", err);
    setState("isRequestPending", false);
  }
}
function expandUI() {
  setState("isMinimized", false);
}
function minimizeUI() {
  setState("isMinimized", true);
}
function main() {
  const isMinimized = useState("isMinimized", false);
  const isRequestPending = useState("isRequestPending", false);
  const cachedPageNavId = useState("pageNavId", null);
  const cachedHeaderId = useState("headerId", null);
  const cachedRequestUrl = useState("requestUrl", null);
  const cachedCookie = useState("cookie", null);
  const cachedContentType = useState("content-type", null);
  const cachedFacesRequest = useState("faces-request", null);
  const cachedOrigin = useState("origin", null);
  const cachedReferer = useState("referer", null);
  const [pageNavigation] = useHeaders((headers) => {
    return headers.filter((item) => {
      if (typeof item?.url !== "string") return false;
      try {
        const url = new URL(item.url);
        return url.hostname === HOST && item.type === "main_frame";
      } catch {
        return false;
      }
    }).slice(-1);
  });
  const [header] = useHeaders((headers) => {
    return headers.filter(
      (item) => typeof item?.url === "string" && item.url.startsWith(MATCH_URL_PREFIX) && (item.method || "").toUpperCase() === METHOD
    ).filter((item) => {
      const facesRequest = getHeaderValue(item, "faces-request");
      return !!facesRequest && facesRequest.toLowerCase().includes("partial/ajax");
    }).slice(-1);
  });
  if (pageNavigation && pageNavigation.id !== cachedPageNavId) {
    setState("pageNavId", pageNavigation.id);
    setState("headerId", null);
    setState("requestUrl", null);
    setState("cookie", null);
    setState("content-type", null);
    setState("faces-request", null);
    setState("origin", null);
    setState("referer", null);
    setState("accept", null);
    setState("accept-language", null);
    setState("user-agent", null);
    setState("pragma", null);
    setState("cache-control", null);
    console.log("[hongleong] cleared captured request on page navigation", {
      pageNavId: pageNavigation.id,
      url: pageNavigation.url
    });
  }
  if (header && header.id !== cachedHeaderId) {
    setState("headerId", header.id);
    setState("requestUrl", header.url || null);
    setState("cookie", getHeaderValue(header, "cookie"));
    setState("content-type", getHeaderValue(header, "content-type"));
    setState("faces-request", getHeaderValue(header, "faces-request"));
    setState("origin", getHeaderValue(header, "origin"));
    setState("referer", getHeaderValue(header, "referer"));
    setState("accept", getHeaderValue(header, "accept"));
    setState("accept-language", getHeaderValue(header, "accept-language"));
    setState("user-agent", getHeaderValue(header, "user-agent"));
    setState("pragma", getHeaderValue(header, "pragma"));
    setState("cache-control", getHeaderValue(header, "cache-control"));
    console.log("[hongleong] captured headers", {
      headerId: header.id
    });
  }
  const missingPieces = [];
  if (!cachedRequestUrl) missingPieces.push("request");
  if (!cachedCookie) missingPieces.push("cookie");
  if (!cachedContentType) missingPieces.push("content-type");
  if (!cachedFacesRequest) missingPieces.push("faces-request");
  if (!cachedOrigin) missingPieces.push("origin");
  if (!cachedReferer) missingPieces.push("referer");
  const isReady = missingPieces.length === 0;
  useEffect(() => {
    setState("pageNavId", null);
    setState("headerId", null);
    setState("requestUrl", null);
    setState("cookie", null);
    setState("content-type", null);
    setState("faces-request", null);
    setState("origin", null);
    setState("referer", null);
    setState("accept", null);
    setState("accept-language", null);
    setState("user-agent", null);
    setState("pragma", null);
    setState("cache-control", null);
    openWindow(LANDING_URL);
  }, []);
  if (isMinimized) {
    return div(
      {
        style: {
          position: "fixed",
          bottom: "20px",
          right: "20px",
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          backgroundColor: "#b71c1c",
          boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
          zIndex: "999999",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "all 0.3s ease",
          fontSize: "16px",
          color: "white",
          fontWeight: "600"
        },
        onclick: "expandUI"
      },
      ["HLB"]
    );
  }
  return div(
    {
      style: {
        position: "fixed",
        bottom: "0",
        right: "8px",
        width: "320px",
        borderRadius: "8px 8px 0 0",
        backgroundColor: "white",
        boxShadow: "0 -2px 10px rgba(0,0,0,0.1)",
        zIndex: "999999",
        fontSize: "14px",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        overflow: "hidden"
      }
    },
    [
      div(
        {
          style: {
            background: "linear-gradient(135deg, #b71c1c 0%, #e53935 100%)",
            padding: "12px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "white"
          }
        },
        [
          div(
            {
              style: {
                fontWeight: "600",
                fontSize: "16px"
              }
            },
            ["Hong Leong Bank"]
          ),
          button(
            {
              style: {
                background: "transparent",
                border: "none",
                color: "white",
                fontSize: "20px",
                cursor: "pointer"
              },
              onclick: "minimizeUI"
            },
            ["-"]
          )
        ]
      ),
      div(
        {
          style: {
            padding: "16px",
            backgroundColor: "#f8f9fa"
          }
        },
        [
          div(
            {
              style: {
                fontSize: "12px",
                color: "#666",
                marginBottom: "12px"
              }
            },
            [
              "Open the bank dashboard, let the real history request fire, then generate the proof."
            ]
          ),
          div(
            {
              style: {
                marginBottom: "12px",
                padding: "10px",
                borderRadius: "6px",
                backgroundColor: isReady ? "#d4edda" : "#fff3cd",
                color: isReady ? "#155724" : "#856404",
                border: `1px solid ${isReady ? "#c3e6cb" : "#ffeeba"}`,
                fontSize: "12px",
                lineHeight: "1.4"
              }
            },
            [
              isReady ? "Captured latest request and required headers." : `Waiting for: ${missingPieces.join(", ")}`
            ]
          ),
          cachedRequestUrl ? div(
            {
              style: {
                marginBottom: "12px",
                padding: "10px",
                borderRadius: "6px",
                backgroundColor: "#f1f3f5",
                color: "#495057",
                border: "1px solid #dee2e6",
                fontSize: "11px",
                wordBreak: "break-all",
                lineHeight: "1.4"
              }
            },
            [cachedRequestUrl]
          ) : "",
          isReady ? button(
            {
              style: {
                width: "100%",
                padding: "10px 12px",
                borderRadius: "6px",
                backgroundColor: isRequestPending ? "#d9d9d9" : "#e53935",
                color: "white",
                border: "none",
                cursor: isRequestPending ? "not-allowed" : "pointer",
                fontWeight: "600"
              },
              onclick: "onClick"
            },
            [isRequestPending ? "Generating..." : "Generate Proof"]
          ) : ""
        ]
      )
    ]
  );
}
const hongleongBank_plugin = { main, onClick, expandUI, minimizeUI, config };
export {
  hongleongBank_plugin as default
};

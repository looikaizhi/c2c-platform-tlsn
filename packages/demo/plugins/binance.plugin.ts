/// <reference types="@tlsn/plugin-sdk/src/globals" />

// Environment variables injected at build time
// @ts-ignore - These will be replaced at build time by Vite's define option
const VERIFIER_URL = VITE_VERIFIER_URL;
// @ts-ignore
const PROXY_URL_BASE = VITE_PROXY_URL;

const HOST = 'www.binance.com';
const PATH = '/bapi/asset/v2/private/asset-service/wallet/balance';
const QUERY = 'quoteAsset=USDT&needBalanceDetail=true';
const FULL_URL = `https://${HOST}${PATH}?${QUERY}`;
const LANDING_URL = 'https://www.binance.com/en/my/dashboard';
const METHOD = 'GET'
const TLSN_POLICY_VERSION = 'v1.0.0';

const config = {
    name: 'Binance KYC Status',
    description: 'Verify Binance KYC status (selective disclosure).',
    policyVersion: TLSN_POLICY_VERSION,
    requests: [
        {
            method: METHOD,
            host: HOST,
            pathname: PATH,
            verifierUrl: VERIFIER_URL,
        },
    ],
    urls: [
        'https://www.binance.com/*',
    ],
};

const REQUIRED_HEADERS = [
    'cookie',
    'csrftoken',
    'device-info',
    'fvideo-id',
    'fvideo-token',
    'bnc-uuid',
];

async function onClick() {
    console.log('[binance] onClick start');
    try {
        const isRequestPending = useState('isRequestPending', false);
        if (isRequestPending) {
            console.log('[binance] onClick ignored: request pending');
            return;
        }
        setState('isRequestPending', true);

        const cachedCookie = useState('cookie', null);
        const cachedCsrfToken = useState('csrftoken', null);
        const cachedDeviceInfo = useState('device-info', null);
        const cachedFvideoId = useState('fvideo-id', null);
        const cachedFvideoToken = useState('fvideo-token', null);
        const cachedBncUuid = useState('bnc-uuid', null);

        const cachedAccept = useState('accept', null);
        const cachedAcceptLanguage = useState('accept-language', null);
        const cachedOrigin = useState('origin', null);
        const cachedReferer = useState('referer', null);
        const cachedUserAgent = useState('user-agent', null);
        const cachedBncLocation = useState('bnc-location', null);
        const cachedBncTimeZone = useState('bnc-time-zone', null);
        const cachedBncLevel = useState('bnc-level', null);
        const cachedClientType = useState('clienttype', null);
        const cachedLang = useState('lang', null);
        const cachedXTraceId = useState('x-trace-id', null);
        const cachedXUiTrace = useState('x-ui-request-trace', null);
        const cachedXPassthrough = useState('x-passthrough-token', null);

        const missingRequired = REQUIRED_HEADERS.filter((key) => {
            const value = useState(key, null);
            return !value;
        });

        if (missingRequired.length > 0) {
            console.log('[binance] missing required headers', missingRequired);
            setState('isRequestPending', false);
            return;
        }

        const headers: Record<string, string> = {
            cookie: cachedCookie,
            csrftoken: cachedCsrfToken,
            'device-info': cachedDeviceInfo,
            'fvideo-id': cachedFvideoId,
            'fvideo-token': cachedFvideoToken,
            'bnc-uuid': cachedBncUuid,
            Host: HOST,
            'content-type': 'application/json',
            'Accept-Encoding': 'identity',
            Connection: 'close',
        };

        if (cachedAccept) headers.accept = cachedAccept;
        if (cachedAcceptLanguage) headers['accept-language'] = cachedAcceptLanguage;
        if (cachedOrigin) headers.origin = cachedOrigin;
        if (cachedReferer) headers.referer = cachedReferer;
        if (cachedUserAgent) headers['user-agent'] = cachedUserAgent;
        if (cachedBncLocation) headers['bnc-location'] = cachedBncLocation;
        if (cachedBncTimeZone) headers['bnc-time-zone'] = cachedBncTimeZone;
        if (cachedBncLevel) headers['bnc-level'] = cachedBncLevel;
        if (cachedClientType) headers.clienttype = cachedClientType;
        if (cachedLang) headers.lang = cachedLang;
        if (cachedXTraceId) headers['x-trace-id'] = cachedXTraceId;
        if (cachedXUiTrace) headers['x-ui-request-trace'] = cachedXUiTrace;
        if (cachedXPassthrough) headers['x-passthrough-token'] = cachedXPassthrough;

        console.log('[binance] prove start', {
            url: FULL_URL,
            headerKeys: Object.keys(headers),
            cookieLen: cachedCookie.length,
        });

        const resp = await prove(
            {
                url: FULL_URL,
                method: METHOD,
                headers: headers,
            },
            {
                verifierUrl: VERIFIER_URL,
                proxyUrl: PROXY_URL_BASE + HOST,
                maxRecvData: 20000,
                maxSentData: 10000,
                handlers: [
                    { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
                    { type: 'RECV', part: 'START_LINE', action: 'REVEAL' },
                    {
                        type: 'RECV',
                        part: 'HEADERS',
                        action: 'REVEAL',
                        params: { key: 'date' },
                    },
                    {
                        type: 'RECV',
                        part: 'BODY',
                        action: 'REVEAL',
                        params: { 
                            type: 'json', 
                            path: 'success',
                        },
                    },
                    {
                        type: 'RECV',
                        part: 'ALL',
                        action: 'REVEAL',
                        params: {
                            type: 'regex',
                            regex: '"balance"\\s*:\\s*"?[0-9.]+"?',
                            flags: 'g'
                        },
                    }
                ],
            }
        );

        console.log('[binance] prove ok');
        done(JSON.stringify(resp));
    } catch (err) {
        console.error('[binance] onClick error', err);
        setState('isRequestPending', false);
    }
}

function expandUI() {
    setState('isMinimized', false);
}

function minimizeUI() {
    setState('isMinimized', true);
}

function main() {
    const isMinimized = useState('isMinimized', false);
    const isRequestPending = useState('isRequestPending', false);
    const cachedCookie = useState('cookie', null);
    const cachedCsrfToken = useState('csrftoken', null);
    const cachedDeviceInfo = useState('device-info', null);
    const cachedFvideoId = useState('fvideo-id', null);
    const cachedFvideoToken = useState('fvideo-token', null);
    const cachedBncUuid = useState('bnc-uuid', null);
    const cachedAccept = useState('accept', null);
    const cachedAcceptLanguage = useState('accept-language', null);
    const cachedOrigin = useState('origin', null);
    const cachedReferer = useState('referer', null);
    const cachedUserAgent = useState('user-agent', null);
    const cachedBncLocation = useState('bnc-location', null);
    const cachedBncTimeZone = useState('bnc-time-zone', null);
    const cachedBncLevel = useState('bnc-level', null);
    const cachedClientType = useState('clienttype', null);
    const cachedLang = useState('lang', null);
    const cachedXTraceId = useState('x-trace-id', null);
    const cachedXUiTrace = useState('x-ui-request-trace', null);
    const cachedXPassthrough = useState('x-passthrough-token', null);
    const headerSeen = useState('headerSeen', false);
    const headerUrl = useState('headerUrl', null);
    const headerMethod = useState('headerMethod', null);
    const debugLogged = useState('debugLogged', false);

    if (!debugLogged) {
        console.log('[binance] main render');
        setState('debugLogged', true);
    }

    try {
        if (
            !cachedCookie ||
            !cachedCsrfToken ||
            !cachedDeviceInfo ||
            !cachedFvideoId ||
            !cachedFvideoToken ||
            !cachedBncUuid
        ) {
            const [header] = useHeaders((headers: any[]) => {
                return headers.filter((h) => {
                    if (typeof h?.url !== 'string') return false;
                    try {
                        return new URL(h.url).pathname === PATH;
                    } catch {
                        return false;
                    }
                });
            });

            if (header) {
                const getHeaderValue = (name: string) =>
                    header.requestHeaders.find(
                        (h: any) => h.name?.toLowerCase() === name
                    )?.value;

                setState('headerSeen', true);
                setState('headerUrl', header.url);
                setState('headerMethod', header.method);

                const cookie = getHeaderValue('cookie');
                const csrfToken = getHeaderValue('csrftoken');
                const deviceInfo = getHeaderValue('device-info');
                const fvideoId = getHeaderValue('fvideo-id');
                const fvideoToken = getHeaderValue('fvideo-token');
                const bncUuid = getHeaderValue('bnc-uuid');
                const accept = getHeaderValue('accept');
                const acceptLanguage = getHeaderValue('accept-language');
                const origin = getHeaderValue('origin');
                const referer = getHeaderValue('referer');
                const userAgent = getHeaderValue('user-agent');
                const bncLocation = getHeaderValue('bnc-location');
                const bncTimeZone = getHeaderValue('bnc-time-zone');
                const bncLevel = getHeaderValue('bnc-level');
                const clienttype = getHeaderValue('clienttype');
                const lang = getHeaderValue('lang');
                const xTraceId = getHeaderValue('x-trace-id');
                const xUiTrace = getHeaderValue('x-ui-request-trace');
                const xPassthrough = getHeaderValue('x-passthrough-token');

                if (cookie && !cachedCookie) {
                    setState('cookie', cookie);
                    console.log('[binance] cookie found');
                }
                if (csrfToken && !cachedCsrfToken) {
                    setState('csrftoken', csrfToken);
                    console.log('[binance] csrftoken found');
                }
                if (deviceInfo && !cachedDeviceInfo) {
                    setState('device-info', deviceInfo);
                    console.log('[binance] device-info found');
                }
                if (fvideoId && !cachedFvideoId) {
                    setState('fvideo-id', fvideoId);
                    console.log('[binance] fvideo-id found');
                }
                if (fvideoToken && !cachedFvideoToken) {
                    setState('fvideo-token', fvideoToken);
                    console.log('[binance] fvideo-token found');
                }
                if (bncUuid && !cachedBncUuid) {
                    setState('bnc-uuid', bncUuid);
                    console.log('[binance] bnc-uuid found');
                }
                if (accept && !cachedAccept) setState('accept', accept);
                if (acceptLanguage && !cachedAcceptLanguage) {
                    setState('accept-language', acceptLanguage);
                }
                if (origin && !cachedOrigin) setState('origin', origin);
                if (referer && !cachedReferer) setState('referer', referer);
                if (userAgent && !cachedUserAgent) setState('user-agent', userAgent);
                if (bncLocation && !cachedBncLocation) setState('bnc-location', bncLocation);
                if (bncTimeZone && !cachedBncTimeZone) setState('bnc-time-zone', bncTimeZone);
                if (bncLevel && !cachedBncLevel) setState('bnc-level', bncLevel);
                if (clienttype && !cachedClientType) setState('clienttype', clienttype);
                if (lang && !cachedLang) setState('lang', lang);
                if (xTraceId && !cachedXTraceId) setState('x-trace-id', xTraceId);
                if (xUiTrace && !cachedXUiTrace) setState('x-ui-request-trace', xUiTrace);
                if (xPassthrough && !cachedXPassthrough) {
                    setState('x-passthrough-token', xPassthrough);
                }
            }
        }
    } catch (error) {
        console.log('[binance] main error', error);
    }

    const headerDetected = !!headerSeen;
    const missingRequired = REQUIRED_HEADERS.filter((key) => !useState(key, null));
    const hasRequired = missingRequired.length === 0;

    useEffect(() => {
        openWindow(LANDING_URL);
    }, []);

    if (isMinimized) {
        return div(
            {
                style: {
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    backgroundColor: '#f0b90b',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                    zIndex: '999999',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    fontSize: '20px',
                    color: '#111',
                },
                onclick: 'expandUI',
            },
            ['BNB']
        );
    }

    return div(
        {
            style: {
                position: 'fixed',
                bottom: '0',
                right: '8px',
                width: '340px',
                borderRadius: '8px 8px 0 0',
                backgroundColor: 'white',
                boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
                zIndex: '999999',
                fontSize: '14px',
                fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                overflow: 'hidden',
            },
        },
        [
            div(
                {
                    style: {
                        background: 'linear-gradient(135deg, #f0b90b 0%, #f8d33a 100%)',
                        padding: '12px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        color: '#111',
                    },
                },
                [
                    div(
                        {
                            style: {
                                fontWeight: '600',
                                fontSize: '16px',
                            },
                        },
                        ['Binance KYC Status']
                    ),
                    button(
                        {
                            style: {
                                background: 'transparent',
                                border: 'none',
                                color: '#111',
                                fontSize: '20px',
                                cursor: 'pointer',
                            },
                            onclick: 'minimizeUI',
                        },
                        ['-']
                    ),
                ]
            ),
            div(
                {
                    style: {
                        padding: '16px',
                    },
                },
                [
                    div(
                        {
                            style: {
                                fontSize: '12px',
                                color: '#666',
                                marginBottom: '12px',
                            },
                        },
                        [
                            'Open the Binance dashboard, then wait for the KYC request to appear.',
                        ]
                    ),
                    headerDetected
                        ? div(
                            {
                                style: {
                                    marginBottom: '12px',
                                    padding: '10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#fff7e6',
                                    color: '#7a4b00',
                                    border: '1px solid #ffe0a3',
                                    fontSize: '12px',
                                    lineHeight: '1.4',
                                },
                            },
                            [
                                headerUrl ? `Header URL: ${headerUrl}` : 'Header URL: (none)',
                                ' ',
                                headerMethod ? `Method: ${headerMethod}` : '',
                            ]
                        )
                        : '',
                    div(
                        {
                            style: {
                                marginBottom: '12px',
                                padding: '10px',
                                borderRadius: '6px',
                                backgroundColor: headerDetected && hasRequired ? '#f6ffed' : '#fff1f0',
                                color: headerDetected && hasRequired ? '#135200' : '#a8071a',
                                border: headerDetected && hasRequired
                                    ? '1px solid #b7eb8f'
                                    : '1px solid #ffa39e',
                                fontSize: '12px',
                            },
                        },
                        [
                            headerDetected
                                ? hasRequired
                                    ? 'Header detected with required auth headers'
                                    : `Header detected but missing: ${missingRequired.join(', ')}`
                                : 'No header detected',
                        ]
                    ),
                    headerDetected && hasRequired
                        ? button(
                            {
                                style: {
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    backgroundColor: isRequestPending ? '#d9d9d9' : '#f0b90b',
                                    color: '#111',
                                    border: 'none',
                                    cursor: isRequestPending ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                },
                                onclick: 'onClick',
                            },
                            [isRequestPending ? 'Generating...' : 'Generate Proof']
                        )
                        : ''
                ]
            ),
        ]
    );
}

export default { main, onClick, expandUI, minimizeUI, config };

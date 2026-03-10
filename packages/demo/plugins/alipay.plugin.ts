/// <reference types="@tlsn/plugin-sdk/src/globals" />

// Environment variables injected at build time
// @ts-ignore - These will be replaced at build time by Vite's define option
const VERIFIER_URL = VITE_VERIFIER_URL;
// @ts-ignore
const PROXY_URL_BASE = VITE_PROXY_URL;

const HOST = 'mbillexprod.alipay.com';
const PATH = '/enterprise/fundReportQuery.json';
const FULL_URL = `https://${HOST}${PATH}`;
const LANDING_URL = 'https://b.alipay.com/page/mbillexprod/fund/business/operate/detail';
const METHOD = 'POST'

function decodeRawBody(rawParts: { bytes?: any }[] | null | undefined) {
    if (!rawParts?.length) return null;

    const chunks: string[] = [];

    for (const part of rawParts) {
        if (!Array.isArray(part?.bytes) || part.bytes.length === 0) {
            continue;
        }

        chunks.push(part.bytes.map((byte: number) => String.fromCharCode(byte)).join(''));
    }

    const decoded = chunks.join('');
    console.log("decoded: ", decoded)
    return decoded || null;
}

function encodeFormBody(formData: Record<string, any> | null | undefined) {
    if (!formData) return null;

    const params = new URLSearchParams(formData);
    // console.log('[alipay] encodeFormBody entries:', Object.entries(formData));
    // console.log(params.toString());
    // for (const [key, value] of Object.entries(formData)) {
    //     if (key === '') continue;
    //     if (Array.isArray(value)) {
    //         for (const item of value) {
    //             if (item !== undefined && item !== null) {
    //                 params.append(key, String(item));
    //             }
    //         }
    //         continue;
    //     }

    //     if (value !== undefined && value !== null) {
    //         params.append(key, String(value));
    //     }
    // }

    const encoded = params.toString().replaceAll('%20', '+');
    console.log(encoded);
    return encoded || null;
}

function extractRequestBody(
    requestBody:
        | {
            formData?: Record<string, any>;
            raw?: { bytes?: any }[];
        }
        | null
        | undefined
) {
    return decodeRawBody(requestBody?.raw) || encodeFormBody(requestBody?.formData);
}

const config = {
    name: 'Alipay Login Account',
    description: 'Verify Alipay merchant logonName and masterCustomerId (selective disclosure).',
    requests: [
        {
            method: METHOD,
            host: HOST,
            pathname: PATH,
            verifierUrl: VERIFIER_URL,
        },
    ],
    urls: [
        'https://b.alipay.com/page/mbillexprod/fund/business/operate/detail',
        'https://www.alipay.com/',
        'https://mbillexprod.alipay.com/enterprise/fundReportQuery.json',
        'https://authea179.alipay.com/login/loginResultDispatch.htm',
        'https://enterpriseportal.alipay.com/*',
        'https://uemprod.alipay.com/*'
    ],
};

async function onClick() {
    console.log('[alipay] onClick start');
    try {
        const isRequestPending = useState('isRequestPending', false);
        if (isRequestPending) {
            console.log('[alipay] onClick ignored: request pending');
            return;
        }
        setState('isRequestPending', true);

        const cachedCookie = useState('cookie', null);
        const cachedContentType = useState('content-type', null);
        const cachedRequestUrl = useState('requestUrl', null);
        const cachedRequestBody = useState('requestBody', null);
        const cachedOrigin = useState('origin', null);
        const cachedReferer = useState('referer', null);
        const cachedAccept = useState('accept', null);
        const cachedAcceptLanguage = useState('acceptLanguage', null);
        const cachedUserAgent = useState('userAgent', null);
        const cachedSecChUa = useState('secChUa', null);
        const cachedSecChUaMobile = useState('secChUaMobile', null);
        const cachedSecChUaPlatform = useState('secChUaPlatform', null);
        const cachedSecFetchDest = useState('secFetchDest', null);
        const cachedSecFetchMode = useState('secFetchMode', null);
        const cachedSecFetchSite = useState('secFetchSite', null);
        if (!cachedCookie || !cachedContentType || !cachedRequestUrl || !cachedRequestBody) {
            console.log('[alipay] missing cookie, content-type, request URL, or request body, abort');
            setState('isRequestPending', false);
            return;
        }

        const headers: Record<string, string> = {
            Accept: cachedAccept!,
            'accept-language': cachedAcceptLanguage!,
            'Accept-Encoding': 'identity',
            'cache-control': 'no-cache',
            'content-type': cachedContentType,
            cookie: cachedCookie,
            Host: HOST,
            Origin: cachedOrigin!,
            'pragma': 'no-cache',
            'priority': 'u=1, i',
            Referer: cachedReferer!,
            'sec-ch-ua': cachedSecChUa!,
            'sec-ch-ua-mobile': cachedSecChUaMobile!,
            'sec-ch-ua-platform': cachedSecChUaPlatform!,
            'sec-fetch-dest': cachedSecFetchDest!,
            'sec-fetch-mode': cachedSecFetchMode!,
            'sec-fetch-site': cachedSecFetchSite!,
            'user-agent': cachedUserAgent!,
            'Connection': 'close',
        };

        console.log('[alipay] prove start', {
            url: cachedRequestUrl,
            headerKeys: Object.keys(headers),
            cookieLen: cachedCookie.length,
        });

        const body = 'gmtDateBegin=2026-03-05+00%3A00%3A00&gmtDateEnd=2026-03-06+00%3A00%3A00&userId=2088542815888498&status=ALL&pageSize=50&pageNum=1&sortTarget=gmtCreate&sortType=0&bizType=ALL&_input_charset=gbk';
        const body1 = 'gmtDateBegin=2026-03-04+00%3A00%3A00&gmtDateEnd=2026-03-05+00%3A00%3A00&userId=2088542815888498&status=ALL&pageSize=50&pageNum=1&sortTarget=gmtCreate&sortType=0&bizType=ALL&_input_charset=gbk';
        const resp = await prove(
            {
                url: cachedRequestUrl,
                method: METHOD,
                headers: headers,
                body: body,
            },
            {
                verifierUrl: VERIFIER_URL,
                proxyUrl: PROXY_URL_BASE + HOST,
                maxRecvData: 20000,
                maxSentData: 10000,
                handlers: [
                    { type: 'SENT', part: 'ALL', action: 'REVEAL' },
                    { type: 'RECV', part: 'ALL', action: 'REVEAL' },
                    // {
                    //     type: 'RECV',
                    //     part: 'HEADERS',
                    //     action: 'REVEAL',
                    //     params: { key: 'date' },
                    // },
                    // {
                    //     type: 'RECV',
                    //     part: 'BODY',
                    //     action: 'REVEAL',
                    //     params: { type: 'json', path: 'data.logonName', hideKey: true },
                    // },
                    // {
                    //     type: 'RECV',
                    //     part: 'BODY',
                    //     action: 'REVEAL',
                    //     params: { type: 'json', path: 'data.masterCustomerId', hideKey: true },
                    // },
                ] as unknown as import('@tlsn/plugin-sdk/src/types').Handler[],
            }
        );

        console.log('[alipay] prove ok');
        done(JSON.stringify(resp));
    } catch (err) {
        console.error('[alipay] onClick error', err);
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
    const cachedContentType = useState('content-type', null);
    const cachedRequestUrl = useState('requestUrl', null);
    const cachedRequestBody = useState('requestBody', null);
    const cachedOrigin = useState('origin', null);
    const cachedReferer = useState('referer', null);
    const cachedAccept = useState('accept', null);
    const cachedAcceptLanguage = useState('acceptLanguage', null);
    const cachedUserAgent = useState('userAgent', null);
    const cachedSecChUa = useState('secChUa', null);
    const cachedSecChUaMobile = useState('secChUaMobile', null);
    const cachedSecChUaPlatform = useState('secChUaPlatform', null);
    const cachedSecFetchDest = useState('secFetchDest', null);
    const cachedSecFetchMode = useState('secFetchMode', null);
    const cachedSecFetchSite = useState('secFetchSite', null);
    const headerSeen = useState('headerSeen', false);
    const headerUrl = useState('headerUrl', null);
    const headerMethod = useState('headerMethod', null);
    const headerHasCookie = useState('headerHasCookie', false);
    const debugLogged = useState('debugLogged', false);

    if (!debugLogged) {
        console.log('[alipay] main render');
        setState('debugLogged', true);
    }

    try{
        if (!cachedCookie || !cachedContentType) {
            const [header] = useHeaders((headers: any[]) =>{
                return headers.filter((h) =>
                    typeof h?.url === 'string' &&
                    new URL(h.url).pathname === PATH &&
                    typeof h?.method === 'string' &&
                    h.method.toUpperCase() === METHOD
                )
            });

            if (header) {
                console.log(header.requestHeaders)
                setState('headerSeen', true);
                setState('headerUrl', header.url);
                setState('headerMethod', header.method);
                const cookie = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'cookie')?.value;
                const contentType = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'content-type')?.value;
                const origin = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'origin')?.value;
                const referer = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'referer')?.value;
                const accept = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'accept')?.value;
                const acceptEncoding = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'accept-encoding')?.value;
                const acceptLanguage = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'accept-language')?.value;
                const cacheControl = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'cache-control')?.value;
                const userAgent = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'user-agent')?.value;
                const secChUa = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'sec-ch-ua')?.value;
                const secChUaMobile = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'sec-ch-ua-mobile')?.value;
                const secChUaPlatform = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'sec-ch-ua-platform')?.value;
                const secFetchDest = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'sec-fetch-dest')?.value;
                const secFetchMode = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'sec-fetch-mode')?.value;
                const secFetchSite = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'sec-fetch-site')?.value;

                if (cookie && !cachedCookie) {
                    setState('cookie', cookie);
                    console.log('[alipay] cookie found: ', cookie);
                }
                if (contentType && !cachedContentType) {
                    setState('content-type', contentType);
                    console.log('[alipay] content-type found: ', contentType);
                }
                setState('headerHasCookie', !!cookie);
                
                if (origin && !cachedOrigin) {
                    setState('origin', origin);
                    console.log('[alipay] origin found: ', origin);
                }
                if (referer && !cachedReferer) {
                    setState('referer', referer);
                    console.log('[alipay] referer found: ', referer);
                }
                if (accept && !cachedAccept) {
                    setState('accept', accept);
                    console.log('[alipay] accept found: ', accept);
                }
                if (acceptLanguage && !cachedAcceptLanguage) {
                    setState('acceptLanguage', acceptLanguage);
                    console.log('[alipay] accept-language found: ', acceptLanguage);
                }
                if (userAgent && !cachedUserAgent) {
                    setState('userAgent', userAgent);
                    console.log('[alipay] user-agent found');
                }
                if (secChUa && !cachedSecChUa) {
                    setState('secChUa', secChUa);
                }
                if (secChUaMobile && !cachedSecChUaMobile) {
                    setState('secChUaMobile', secChUaMobile);
                }
                if (secChUaPlatform && !cachedSecChUaPlatform) {
                    setState('secChUaPlatform', secChUaPlatform);
                }
                if (secFetchDest && !cachedSecFetchDest) {
                    setState('secFetchDest', secFetchDest);
                }
                if (secFetchMode && !cachedSecFetchMode) {
                    setState('secFetchMode', secFetchMode);
                }
                if (secFetchSite && !cachedSecFetchSite) {
                    setState('secFetchSite', secFetchSite);
                }
            }
        }

        if (!cachedRequestUrl || !cachedRequestBody) {
            const [request] = useRequests((requests: any[]) => {
                return requests.filter((r) =>
                    typeof r?.url === 'string' &&
                    new URL(r.url).pathname === PATH &&
                    typeof r?.method === 'string' &&
                    r.method.toUpperCase() === METHOD
                );
            });

            if (request) {
                const requestBody = extractRequestBody(request.requestBody);

                if (request.url && !cachedRequestUrl) {
                    setState('requestUrl', request.url);
                    console.log('[alipay] request URL found: ', request.url);
                }
                if (requestBody && !cachedRequestBody) {
                    setState('requestBody', requestBody);
                    console.log('[alipay] request body found: ', requestBody);
                    console.log('[alipay] requestBody raw:', request.requestBody?.raw);
                    console.log('[alipay] requestBody formData:', request.requestBody?.formData);
                }
            }
        }
    } catch (error){
        console.log('Main Error: ', error);
    }

    const headerDetected = !!headerSeen;

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
                    backgroundColor: '#1677ff',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                    zIndex: '999999',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    fontSize: '24px',
                    color: 'white',
                },
                onclick: 'expandUI',
            },
            ['💰']
        );
    }

    return div(
        {
            style: {
                position: 'fixed',
                bottom: '0',
                right: '8px',
                width: '320px',
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
                        background: 'linear-gradient(135deg, #1677ff 0%, #3f8cff 100%)',
                        padding: '12px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        color: 'white',
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
                        ['Alipay Login Account']
                    ),
                    button(
                        {
                            style: {
                                background: 'transparent',
                                border: 'none',
                                color: 'white',
                                fontSize: '20px',
                                cursor: 'pointer',
                            },
                            onclick: 'minimizeUI',
                        },
                        ['−']
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
                            'Open the Alipay detail page, then wait for the account request to appear.',
                        ]
                    ),
                    (headerDetected || !!cachedRequestUrl) ? div(
                        {
                            style: {
                                marginBottom: '12px',
                                padding: '10px',
                                borderRadius: '6px',
                                backgroundColor: '#eef3ff',
                                color: '#0b2e6f',
                                border: '1px solid #cfdcff',
                                fontSize: '12px',
                                lineHeight: '1.4',
                            },
                        },
                        [
                            div(
                                {
                                    style: {
                                        marginBottom: '6px',
                                        wordBreak: 'break-all',
                                    },
                                },
                                [headerUrl ? `Header URL: ${headerUrl}` : 'Header URL: (none)']
                            ),
                            div(
                                {
                                    style: {
                                        marginBottom: '6px',
                                    },
                                },
                                [headerMethod ? `Method: ${headerMethod}` : 'Method: (none)']
                            ),
                            div(
                                {
                                    style: {
                                        marginBottom: '6px',
                                        wordBreak: 'break-all',
                                    },
                                },
                                [cachedRequestUrl ? `Request URL: ${cachedRequestUrl}` : 'Request URL: (none)']
                            ),
                            div(
                                {},
                                [cachedRequestBody ? `Request Body: ${cachedRequestBody}` : 'Request Body: (none)']
                            ),
                        ]
                    ) : '',
                    div(
                        {
                            style: {
                                marginBottom: '12px',
                                padding: '10px',
                                borderRadius: '6px',
                                backgroundColor: headerDetected ? '#e6fffb' : '#fff1f0',
                                color: headerDetected ? '#006d75' : '#a8071a',
                                border: headerDetected ? '1px solid #b5f5ec' : '1px solid #ffa39e',
                                fontSize: '12px',
                            },
                        },
                        [
                            headerDetected
                                ? headerHasCookie
                                    ? 'Header detected with Cookie'
                                    : 'Header detected (Cookie missing)'
                                : 'No header detected',
                        ]
                    ),
                    headerDetected ? button(
                        {
                            style: {
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '6px',
                                backgroundColor: isRequestPending ? '#d9d9d9' : '#1677ff',
                                color: 'white',
                                border: 'none',
                                cursor: isRequestPending ? 'not-allowed' : 'pointer',
                                fontWeight: '600',
                            },
                            onclick: 'onClick',
                        },
                        [isRequestPending ? 'Generating...' : 'Generate Proof']
                    ) : ""
                ]
            ),
        ]
    );
}

export default { main, onClick, expandUI, minimizeUI, config};

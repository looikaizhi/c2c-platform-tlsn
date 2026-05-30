# 如何开发一个 TLSN Plugin —— 完整教程

本文档教你从零写一个 **针对任意 HTTPS 网站** 的 TLSNotary Plugin，并把它接入 demo。
读完后你应该能独立完成：选目标接口 → 抓 headers → 写 plugin → 注册到前端 → 跑通生成 proof。

> 配套阅读：
> - 整体架构 / 怎么跑：[DEMO_ARCHITECTURE.md](DEMO_ARCHITECTURE.md)
> - 仅在前端注册（不写新逻辑）：[ADDING_PLUGINS.md](ADDING_PLUGINS.md)
> - 参考实现：[plugins/alipay.plugin.ts](plugins/alipay.plugin.ts)、[plugins/wise.plugin.ts](plugins/wise.plugin.ts)、[plugins/binance.plugin.ts](plugins/binance.plugin.ts)

---

## 0. 你需要先理解的概念

| 名词 | 含义 |
|------|------|
| **Host 环境**          | TLSN Chrome 扩展的 offscreen + QuickJS 沙箱，由 [@tlsn/plugin-sdk](../plugin-sdk) 实现，注入全局 API（`prove`、`useHeaders`、`div`、`button` 等）给插件代码用 |
| **Plugin**             | 一个 JS 模块，`export default { main, onClick, config, ... }`。`main()` 返回 DOM JSON 渲染插件浮窗 UI；`onClick()` 触发 `prove()` 生成证明 |
| **Capture 阶段**       | 插件不能凭空发请求 —— 必须等用户在真实网站里登录、触发对应接口，插件通过 `useHeaders()` / `useRequests()` 抓到 cookie + 真实 URL + body |
| **Prove 阶段**         | 拿抓到的 headers 重放一次请求，但走 TLS-MPC 协议（prover ↔ proxy ↔ server），verifier 在另一端校验密文，签发 proof |
| **Handlers**           | 决定 transcript 的哪一段以 `REVEAL`（明文披露）或 `PEDERSEN`（哈希承诺）方式写进 proof |
| **Selective Disclosure**| 只暴露你需要的字段（比如 `gmtSuccess`、`payAmount`），其它（cookie、token、个人信息）保持密文 |

---

## 1. 总体步骤

1. **选目标接口**：找网站里那个「响应里包含你要证明字段」的 HTTPS 请求。
2. **抓样本**：DevTools → Network，记录 method / URL / 请求 headers / 响应 body。
3. **设计 reveal 策略**：决定哪些字节用 REVEAL，哪些用 regex / JSON 路径定位。
4. **新建插件 TS 文件**：`packages/demo/plugins/<name>.plugin.ts`。
5. **写 `config` + `main()` + `onClick()`**。
6. **注册到 `build-plugins.js` 和 `src/plugins.ts`**。
7. **重启 `npm run dev`**，在 demo 页面点按钮跑通。

---

## 2. 第一步 —— 选目标接口

打开你要证明数据的网站，按 F12，**Network** 面板里筛选 `XHR/Fetch`。找符合以下条件的请求：

- ✅ 响应体里直接包含你要证明的字段（json 最好）
- ✅ 是 `GET` 或简单 `POST`（请求体最好是表单或 JSON）
- ✅ 不依赖动态签名/防重放（如果有 timestamp+sign，可能要带上 captured timestamp）
- ✅ 单次响应 < `maxRecvData`（默认设 3000-16384 字节，超出会被截断）

把这个请求的 **Request URL** 和 **Request Method** 记下来。

> 例子：Alipay 商家后台的「资金明细查询」接口
>
> ```
> POST https://mbillexprod.alipay.com/enterprise/fundReportDetailQuery.json
> ```

---

## 3. 第二步 —— 抓样本

在 DevTools 里右键这条请求 → **Copy as cURL** / **Copy as fetch**。看 3 件事：

1. **Headers** —— 哪些是必须的？通常是 `cookie`、`content-type`、`user-agent`、`referer`、`origin`、平台自定义 token（`x-access-token`、`x-csrf-token`…）
2. **Request body** —— 表单/JSON/查询字符串？
3. **Response body** —— 找到你要证明的字段，记录字段名和值的结构（顶层 / 嵌套 / 数组）

> Wise 例子里需要的两个接口：
>
> ```
> GET https://wise.com/gateway/v2/profiles/<profileId>/contacts
> GET https://wise.com/gateway/v3/profiles/<profileId>/transfers/<transferId>
> ```
>
> 都需要 `cookie` + `x-access-token`。

---

## 4. 第三步 —— 设计 reveal 策略

`prove()` 调用里的 `handlers` 数组决定每个字节区段如何披露。每个 handler 形如：

```ts
{
  type:   'SENT' | 'RECV',          // 请求段 还是 响应段
  part:   'START_LINE' | 'PROTOCOL' | 'METHOD' | 'REQUEST_TARGET'
        | 'STATUS_CODE' | 'HEADERS' | 'BODY' | 'ALL',
  action: 'REVEAL' | 'PEDERSEN',
  params?: {
    type?: 'json' | 'regex' | 'header',
    path?: string,                  // type:'json' 时：顶层字段名
    regex?: string,                 // type:'regex' 时
    flags?: string,
    hideKey?: boolean,              // 只露 value 不露 key
    hideValue?: boolean,
  },
  label?: string,                   // 给前端展示用的标签
}
```

经验法则：

- **SENT/START_LINE** 几乎总要 REVEAL —— 让 verifier 知道你确实请求了那个 URL。
- **RECV/START_LINE** REVEAL —— 让 verifier 看到响应是 `200 OK`。
- **响应里要证明的字段**：
  - 顶层 JSON 字段 → `params: { type: 'json', path: 'fieldName' }`
  - 嵌套 / 数组里的字段 → `part: 'ALL' + params: { type: 'regex', regex: '"field"\\s*:\\s*"[^"]*"' }`（Parser 目前**不支持嵌套 JSON 路径**，只能 regex）
- **其它一切不要 REVEAL**：cookie、token、个人信息 verifier 都不会看到（依旧上 TLS，但 transcript 里只承诺哈希）。

---

## 5. 第四步 —— 新建插件文件

在 `packages/demo/plugins/` 下新建 `<name>.plugin.ts`。下面是一个**可直接用作模板**的最小骨架（以一个虚构的 `acmebank` 为例，证明账户余额）：

```ts
/// <reference types="@tlsn/plugin-sdk/src/globals" />

// ─────────── 构建时注入的环境变量 ───────────
// @ts-ignore
const VERIFIER_URL = VITE_VERIFIER_URL;
// @ts-ignore
const PROXY_URL_BASE = VITE_PROXY_URL;

// ─────────── 目标接口元数据 ───────────
const HOST   = 'api.acmebank.example';
const PATH   = '/v1/accounts/balance';
const METHOD = 'GET';
const LANDING_URL = 'https://acmebank.example/login';   // 用户先登录这个页面
const TLSN_POLICY_VERSION = 'v1.0.0';

// ─────────── 扩展显示用 config ───────────
const config = {
    name: 'AcmeBank Balance',
    description: 'Prove your AcmeBank account balance without revealing identity.',
    policyVersion: TLSN_POLICY_VERSION,
    requests: [{
        method: METHOD,
        host:   HOST,
        pathname: PATH,
        verifierUrl: VERIFIER_URL,
    }],
    urls: [`https://${HOST}/*`, 'https://acmebank.example/*'],
};

// ─────────── reveal 策略 ───────────
const HANDLERS = [
    { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
    { type: 'RECV', part: 'START_LINE', action: 'REVEAL' },
    // 顶层 JSON 字段 → 用 path
    { type: 'RECV', part: 'BODY', action: 'REVEAL',
        params: { type: 'json', path: 'balance' },
        label: 'account.balance' },
    { type: 'RECV', part: 'BODY', action: 'REVEAL',
        params: { type: 'json', path: 'currency' },
        label: 'account.currency' },
    // 嵌套字段 → 用 regex on ALL
    { type: 'RECV', part: 'ALL', action: 'REVEAL',
        params: { type: 'regex', regex: '"updatedAt"\\s*:\\s*"[^"]*"' },
        label: 'account.timestamp' },
] as unknown as import('@tlsn/plugin-sdk/src/types').Handler[];

// ─────────── 工具：从 header 列表里取值 ───────────
function getHeaderValue(header: any, name: string): string | null {
    return header?.requestHeaders?.find(
        (h: any) => h?.name?.toLowerCase() === name.toLowerCase()
    )?.value || null;
}

// ─────────── 点 "Generate Proof" 按钮 ───────────
async function onClick() {
    try {
        const pending = useState('pending', false);
        if (pending) return;
        setState('pending', true);

        const requestUrl = useState('requestUrl', null);
        const cookie     = useState('cookie', null);
        const userAgent  = useState('user-agent', null);

        if (!requestUrl || !cookie) {
            console.log('[acmebank] missing captured data, abort');
            setState('pending', false);
            return;
        }

        const headers: Record<string, string> = {
            cookie,
            Host: HOST,
            'Accept-Encoding': 'identity',   // 必须！MPC 不支持 gzip
            'Connection': 'close',
            'user-agent': userAgent!,
        };

        const proof = await prove(
            { url: requestUrl, method: METHOD, headers },
            {
                verifierUrl: VERIFIER_URL,
                proxyUrl:    PROXY_URL_BASE + HOST,
                maxRecvData: 4096,
                maxSentData: 2048,
                transcriptCommitHashAlg: 'Keccak256',
                handlers: HANDLERS,
            }
        );

        done(JSON.stringify({
            displayResults: (proof as any).displayResults || (proof as any).results || [],
            ...proof,
        }));
    } catch (e) {
        console.error('[acmebank] error', e);
        setState('pending', false);
    }
}

// ─────────── 浮窗 UI ───────────
function main() {
    const pending     = useState('pending', false);
    const cachedUrl   = useState('requestUrl', null);
    const cachedCk    = useState('cookie', null);

    // 1) 监听匹配的 HTTP 请求 header
    if (!cachedCk) {
        const [hit] = useHeaders((all: any[]) =>
            all.filter(h =>
                typeof h?.url === 'string' &&
                new URL(h.url).pathname === PATH &&
                (h.method || '').toUpperCase() === METHOD
            )
        );
        if (hit) {
            setState('requestUrl', hit.url);
            setState('cookie',     getHeaderValue(hit, 'cookie'));
            setState('user-agent', getHeaderValue(hit, 'user-agent'));
        }
    }

    // 2) 首次进入：跳到登录页面
    useEffect(() => {
        if (LANDING_URL) openWindow(LANDING_URL);
    }, []);

    const ready = !!cachedUrl && !!cachedCk;

    return div(
        { style: {
            position: 'fixed', bottom: 0, right: '8px',
            width: '320px', padding: '16px',
            background: 'white', borderRadius: '8px 8px 0 0',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
            zIndex: '999999', fontFamily: 'system-ui, sans-serif',
        }},
        [
            div({ style: { fontWeight: 600, marginBottom: '8px' }},
                ['AcmeBank Balance Prover']),
            div({ style: { fontSize: '12px', color: '#666', marginBottom: '12px' }},
                [ready
                    ? 'Captured request, ready to prove.'
                    : 'Log in and visit your balance page so the request is captured.']),
            ready
                ? button({
                    style: {
                        width: '100%', padding: '10px',
                        background: pending ? '#aaa' : '#2f6f00',
                        color: 'white', border: 'none', borderRadius: '6px',
                        cursor: pending ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                    },
                    onclick: 'onClick',
                }, [pending ? 'Generating…' : 'Generate Proof'])
                : '',
        ]
    );
}

export default { main, onClick, config };
```

### 5.1 必须有的导出

```ts
export default { main, onClick, config /*, 可选: expandUI, minimizeUI, ... */ };
```

| 导出     | 作用 |
|----------|------|
| `config` | 元数据 + `requests` 白名单（请求拦截只对 host+pathname 命中的请求生效） |
| `main`   | 反应式渲染函数，每次状态变化时被调用，返回 DOM JSON。也可以接收 `force` 形参用于强制刷新 |
| `onClick`| `main` 里 `button({ onclick: 'onClick' })` 引用的回调，触发 `prove()` |

### 5.2 沙箱里可用的全局 API（来自 plugin-sdk）

| API | 用途 |
|-----|------|
| `useState(key, default)`     | 读状态（默认值） |
| `setState(key, value)`       | 写状态，触发 `main()` 重渲染 |
| `useHeaders(filter)`         | 订阅当前管理窗口里截获的请求 headers，filter 过滤后返回数组 |
| `useRequests(filter)`        | 同上，但带 `requestBody` |
| `useEffect(fn, deps)`        | React 风格副作用（deps=[] 即只跑一次） |
| `openWindow(url, opts?)`     | 新开一个被扩展管理的窗口（必须先调用才能开始抓 header） |
| `prove(req, opts)`           | 生成 TLS proof（详见下节） |
| `done(jsonString)`           | 结束本次执行，回传结果给前端 `execCode` 的 Promise |
| `div(props, children)`       | DOM JSON `<div>` |
| `button(props, children)`    | DOM JSON `<button>`，`onclick:'fnName'` 必须是导出函数名字符串 |

### 5.3 `prove()` 参数详解

```ts
prove(
    { url, method, headers, body? },     // 重放参数（注意 Body 是字符串/JSON）
    {
        verifierUrl,                      // 必填
        proxyUrl,                         // 必填，e.g. PROXY_URL_BASE + HOST
        maxRecvData,                      // 响应最大字节，超出会截断 → reveal 失败
        maxSentData,                      // 请求最大字节
        transcriptCommitHashAlg: 'Keccak256' | 'Blake3',
        handlers,                         // ⭐ reveal 策略
        sessionData?: Record<string, string>,  // 业务绑定数据（hash / 地址）
        accountCheckFields?: [{ handlerIndex, sessionDataKey, valueMode }],
        transcriptCommitDebug?: { exposeOpenings, includeVerifierTranscript, runSelfCheck },
    }
)
```

**关键注意事项**

1. 一定加 `'Accept-Encoding': 'identity'` 和 `'Connection': 'close'`，否则 transcript 是 gzip / chunked 你解不出来。
2. `params` 名字是 `handlers`（**复数**），不是 `reveal`。
3. POST + 表单体：很多服务对 body 解析严格，建议像 [plugins/alipay.plugin.ts:128](plugins/alipay.plugin.ts) 那样把表单字符串拼到 URL 的 query 后面（WASM 把 string body 包成 JSON 字符串会跑挂）。
4. JSON 嵌套字段（如 `result.data.balance`）**不支持**，必须用 regex。
5. `maxRecvData` 留够余量；如果响应可能很大，提前在 UI 里告诉用户「请刷新到第一页」之类。

---

## 6. 第五步 —— 注册到 demo

需要改两个地方。

### 6.1 加入构建管线

打开 [build-plugins.js](build-plugins.js)，把名字加到数组：

```js
const plugins = [
    'alipay',
    'binance',
    'wise',
    'acmebank',          // ⬅ 新增
];
```

这会让 `node build-plugins.js` 把 `plugins/acmebank.plugin.ts` 编译成 `public/plugins/acmebank.js`。

### 6.2 加入前端卡片

打开 [src/plugins.ts](src/plugins.ts)，按下面格式追加：

```ts
import { Plugin } from './types';

export const plugins: Record<string, Plugin> = {
    alipay:  { /* … */ },
    binance: { /* … */ },
    wise:    { /* … */ },

    acmebank: {                                  // ⬅ 新增
        name: 'AcmeBank Balance',
        description: 'Prove your AcmeBank balance with selective disclosure.',
        logo: '🏦',
        file: '/plugins/acmebank.js',
        parseResult: (json) => {
            const r = (json as any).displayResults || (json as any).results;
            if (!r?.length) return 'Proof committed (no plaintext revealed)';
            return r[r.length - 1].value;
        },
    },
};
```

字段说明见 [ADDING_PLUGINS.md](ADDING_PLUGINS.md)。

### 6.3 重启 demo

```bash
cd packages/demo
# ctrl-C 掉之前的 dev
npm run dev
```

`scripts/start-dev.js` 会先 build 所有 plugin，再起 Vite。页面上「Try It: Demo Plugins」就会多出你的卡片。

---

## 7. 第六步 —— 跑通 & 调试

1. 三项体检全绿（浏览器 / 扩展 / verifier）。
2. 点你的插件按钮：
   - 控制台应出现 `🔧 Executing plugin code...`
   - 扩展会自动开一个新窗口跳到 `LANDING_URL`
   - 你在那里登录，浏览页面让目标接口被触发
3. 浮窗 UI 应从 "Waiting…" 变成 "Captured…"，按钮亮起。
4. 点 **Generate Proof**：
   - 控制台显示 prove 开始；TLS-MPC 跑 5-30 秒（看网络）
   - 完成后卡片里出现解析后的字段值
   - 展开 **Console Output** 看完整 debug JSON

### 7.1 排错速查

| 现象 | 可能原因 | 处理 |
|------|---------|------|
| 浮窗不出现 | `urls` 没匹配上当前页面 | 改 `config.urls`；或在控制台看 background 日志 |
| 一直 "Waiting…" | `useHeaders` 的 filter 没命中真实请求 | console.log 一下 `all.map(h => h.url)`，确认 pathname/method 写对 |
| `prove` 立刻挂 | proxy 不通 / `Accept-Encoding: gzip` / body 太大 | 强制 `identity`，调大 `maxRecvData`，或先用本地 wstcp |
| `prove` 完成但 `displayResults` 为空 | regex 写错 / json path 命中失败 | 在 verifier 日志里看 reveal 失败信息，把 regex 在响应文本上测一遍 |
| `Invalid Body=JsonValue` | POST 表单 body 没改写 | 像 alipay 那样把表单拼到 query string |
| 改完 ts 不生效 | 没重新 build | `node build-plugins.js` 或重启 `npm run dev` |

---

## 8. 进阶：跟 C2C 合约绑定（可跳过）

如果你要把这条 proof 提交到 demo 自带的 C2C 合约（参考 Alipay/Wise 的做法），需要：

1. 在插件顶部声明 sentinel 常量：
   ```ts
   const ORDER_BINDING_HASH    = '0x0000…0001';
   const MERCHANT_NAME_HASH    = '0x0000…0002';
   const OWNER_ADDRESS         = '0x0000…0007';
   const TENANT_ID             = '__TLSN_TENANT_ID_SENTINEL__';
   ```
2. 在 `prove()` 的 `sessionData` 里带上：
   ```ts
   sessionData: {
       __tlsn_order_binding_hash: ORDER_BINDING_HASH,
       __tlsn_merchant_name_hash: MERCHANT_NAME_HASH,
       __tlsn_owner_address:      OWNER_ADDRESS,
       __tlsn_tenant_id:          TENANT_ID,
   },
   ```
3. 在 `accountCheckFields` 里告诉 verifier「第 N 个 handler 抽出来的 json_value 应该等于哪个 hash」。
4. 前端在 `execCode()` 之前用真实订单数据 `replace()` 这些 sentinel；提交链上时 `src/utils/services.ts` 的 `submitPaymentProofs` 会把 `proofs.contacts` / `proofs.transfer`（或单 `proof`）包成 `PaymentProof` 调合约（按 `assetType` 路由到 `payOrderByPlatform` / `receiveCryptoWithPlatformPayment`）。

详细映射逻辑参考：
- [src/utils/proof.ts](src/utils/proof.ts) — Transformer + Sentinels + Artifact + BackfillTx
- [src/utils/platforms.ts](src/utils/platforms.ts) — PlatformAdapter + runPaymentPlugin
- [src/utils/services.ts](src/utils/services.ts) — 业务用例（placeOrder / makeBindingContext / submitPaymentProofs / claimBond）

---

## 9. Checklist

写完一个新插件前对一遍：

- [ ] `config.requests[].host` + `pathname` 命中目标接口
- [ ] `config.urls` 覆盖了你 `openWindow()` 跳转的所有页面
- [ ] `useHeaders` filter 真的能选中那条请求（控制台打过 log 验证）
- [ ] cookie / 平台 token 都被 `setState` 缓存了
- [ ] `prove()` 里 `Accept-Encoding: identity` + `Connection: close`
- [ ] handlers 里至少有 `SENT START_LINE` + `RECV START_LINE` + 你的目标字段
- [ ] `maxRecvData` ≥ 你预期的响应字节数
- [ ] 在 [build-plugins.js](build-plugins.js) 加了名字
- [ ] 在 [src/plugins.ts](src/plugins.ts) 加了卡片
- [ ] 重启 `npm run dev`，端到端跑通一次

完成 ✅

# zkTLS C2C Exchange — Web Redesign & Business Logic Implementation Plan

> **Date:** 2026-04-25  
> **Branch:** Targets `packages/web` directory  
> **Goal:** Redesign the frontend to exchange-style, fully integrate the C2C business flows from the `demo` package, and enforce a modular codebase.

---

## 1. Executive Summary

The `packages/web` directory has the structural skeleton (Next.js 15, hooks, API routes) but suffers two problems:

1. **UI is not visually polished.** Components are functional but lack the professional dark-exchange aesthetic expected of a crypto product.
2. **Business logic is incomplete.** The `demo` package contains proven proof-generation flows (Wise / Alipay, Crypto / Fiat) that have not been fully ported; the web's `proofTransformer.ts` is a stripped-down version missing `rateVersion` and merchant/payee hash fields.

This plan redesigns the UI from scratch using the **Binance P2P** visual language and fills every gap in the business flow by porting the demo's production-tested logic.

---

## 2. Design System

### 2.1 Color Tokens (Binance-Inspired Dark)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-base` | `#0B0E11` | Page background |
| `--bg-surface` | `#1E2329` | Cards, panels |
| `--bg-elevated` | `#2B3139` | Modals, dropdowns |
| `--bg-hover` | `#363D45` | Hover states |
| `--color-primary` | `#F0B90B` | CTAs, highlights, active tabs |
| `--color-primary-hover` | `#D9A808` | CTA hover |
| `--color-buy` | `#0ECB81` | Buy actions, positive values |
| `--color-sell` | `#F6465D` | Sell actions, negative values |
| `--text-primary` | `#EAECEF` | Primary text |
| `--text-secondary` | `#848E9C` | Labels, muted info |
| `--text-tertiary` | `#5E6673` | Placeholders |
| `--border-default` | `#2B3139` | Dividers, card borders |
| `--border-active` | `#F0B90B` | Focused inputs |
| `--status-warning` | `#F0B90B` | Warning badges |
| `--status-success` | `#0ECB81` | Success badges |
| `--status-danger` | `#F6465D` | Error badges |
| `--status-info` | `#2196F3` | Info badges |
| `--status-muted` | `#2B3139` | Neutral/pending badges |

### 2.2 Typography

| Use | Font | Weight | Size |
|-----|------|--------|------|
| Headings | IBM Plex Sans | 700 | 18–32px |
| UI labels | IBM Plex Sans | 500 | 13–15px |
| Body text | IBM Plex Sans | 400 | 14px |
| Prices / amounts | JetBrains Mono | 600 | 14–20px |
| Addresses / hashes | JetBrains Mono | 400 | 12–13px |

### 2.3 Spacing & Layout

- 4px grid system (`--space-1` = 4px, `--space-2` = 8px, …, `--space-8` = 32px)
- Header height: 56px fixed
- Trading tab bar: 44px
- Max content width: 1440px centered
- Card border-radius: 8px (`--radius-md`)
- Input/button height: 40px standard, 48px large CTA

### 2.4 Component Style Reference

| Component | Visual Pattern |
|-----------|---------------|
| Buy/Sell toggle | Pill with `--color-buy` / `--color-sell` fill |
| Primary button | Yellow fill `--color-primary`, dark text |
| Ghost button | Transparent, `--border-default`, `--text-primary` |
| Danger button | `--color-sell` fill, white text |
| Input | Dark surface, `--border-default`, yellow focus ring |
| Table row hover | `--bg-hover` background transition 150ms |
| Status badge | Pill with semantic color + dot prefix |
| Modal overlay | `rgba(0,0,0,0.65)` backdrop blur 4px |

---

## 3. File Inventory

### 3.1 Files to DELETE

| File | Reason |
|------|--------|
| `src/components/TradingPage.tsx` | Replaced by `components/layout/TradingLayout.tsx` |
| `src/components/ExpressPage.tsx` | Replaced by `components/trading/ExpressPage.tsx` |
| `src/components/P2P_Page.tsx` | Replaced by `components/trading/P2PPage.tsx` |
| `src/components/ui/ActionButton.tsx` | Replaced by new `ui/Button.tsx` |
| `src/components/ui/MetricChip.tsx` | Replaced by new `ui/MetricCard.tsx` |
| `src/components/ui/SectionHeader.tsx` | Replaced by new `ui/SectionHeader.tsx` (rewrite) |
| `src/components/ui/StatusPill.tsx` | Replaced by new `ui/Badge.tsx` |
| `src/components/ui/SurfaceCard.tsx` | Replaced by new `ui/Card.tsx` |

### 3.2 Files to KEEP (no changes)

| File | Status |
|------|--------|
| `src/app/api/**/*` | All API routes are correct — keep as-is |
| `src/app/page.tsx` | Simple redirect — keep |
| `src/app/trade/*/page.tsx` | Thin wrappers — keep |
| `src/app/dashboard/page.tsx` | Page shell — keep |
| `src/app/merchant/page.tsx` | Dynamic import shell — keep |
| `src/app/admin/page.tsx` | Dynamic import shell — keep |
| `src/app/orders/[orderId]/page.tsx` | Keep |
| `src/hooks/useWallet.ts` | Working — keep |
| `src/hooks/useTradeQuote.ts` | Working — keep |
| `src/hooks/queries/*` | All query hooks — keep |
| `src/lib/contractAbi.ts` | Keep |
| `src/lib/contractConfig.ts` | Keep |
| `src/lib/contractSubmitter.ts` | Keep |
| `src/lib/eip712.ts` | Keep |
| `src/lib/apiClient.ts` | Keep |
| `src/lib/queryKeys.ts` | Keep |
| `src/lib/walletDiscovery.ts` | Keep |
| `src/lib/priceModel.ts` | Keep |
| `src/lib/orderHelpers.ts` | Keep |
| `src/providers/AppQueryProvider.tsx` | Keep |
| `src/types/tlsn.d.ts` | Keep |
| `src/interface/tradingPage.ts` | Keep |
| `src/interface/price.ts` | Keep |
| `src/server/database.ts` | Keep |
| `src/server/db_types.ts` | Keep |
| `src/components/admin/**` | Keep (business logic is correct) |
| `src/components/p2p/orderLifecycle.ts` | Keep |
| `src/components/p2p/types.ts` | Keep |

### 3.3 Files to MODIFY

| File | Changes |
|------|---------|
| `src/app/globals.css` | Full rewrite — new design tokens, exchange dark theme |
| `src/app/layout.tsx` | Update font imports (IBM Plex Sans + JetBrains Mono only) |
| `src/components/WalletConnect.tsx` | Reskin to exchange style |
| `src/components/Header.tsx` | Full redesign — exchange nav bar |
| `src/hooks/useContract.ts` | Extend with new ProofAction types |
| `src/hooks/useOrderFlow.ts` | Extend to support full platform/direction matrix |
| `src/hooks/useTlsnExtension.ts` | Add `injectMerchantHashes` and `rateVersion` support |
| `src/lib/proofTransformer.ts` | Sync with demo: add `rateVersion`, merchant/payee hash fields |
| `src/components/PlaceOrderModal.tsx` | Full redesign — exchange modal style |
| `src/components/TlsnVerifyButton.tsx` | Reskin + full proof submission wiring |
| `src/components/ProofStatus.tsx` | Reskin to match new design |
| `src/components/express/ExpressHero.tsx` | Full redesign |
| `src/components/express/ExpressTradeCard.tsx` | Full redesign — Binance-style trade card |
| `src/components/dashboard/DashboardOrdersTable.tsx` | Reskin |
| `src/components/dashboard/DashboardStats.tsx` | Reskin |
| `src/components/merchant/ListProductTab.tsx` | Reskin |
| `src/components/merchant/ManageTab.tsx` | Reskin |
| `src/components/merchant/OrdersTab.tsx` | Reskin |
| `src/components/merchant/MerchantStatusCard.tsx` | Reskin |
| `src/components/merchant/RegisterSection.tsx` | Reskin |
| `src/components/p2p/P2PFilters.tsx` | Reskin |
| `src/components/p2p/P2POrderTable.tsx` | Full redesign — OKX P2P-style table |
| `src/components/p2p/P2PPaymentModal.tsx` | Reskin |

### 3.4 Files to CREATE

| File | Purpose |
|------|---------|
| `src/components/layout/TradingLayout.tsx` | Exchange trading layout with tab navigation |
| `src/components/layout/Footer.tsx` | Minimal footer with links |
| `src/components/ui/Button.tsx` | Primary/ghost/danger/buy/sell variants |
| `src/components/ui/Badge.tsx` | Status/label badges with semantic colors |
| `src/components/ui/Card.tsx` | Surface card container with variants |
| `src/components/ui/Modal.tsx` | Reusable modal wrapper with overlay |
| `src/components/ui/Input.tsx` | Exchange-style text input |
| `src/components/ui/Select.tsx` | Exchange-style select dropdown |
| `src/components/ui/Table.tsx` | Sortable data table with exchange styling |
| `src/components/ui/Spinner.tsx` | Loading spinner |
| `src/components/ui/Tabs.tsx` | Tab bar component |
| `src/components/ui/TokenIcon.tsx` | Crypto token icon with fallback |
| `src/components/ui/AddressDisplay.tsx` | Truncated address with copy button |
| `src/components/trading/P2PPage.tsx` | Redesigned P2P marketplace |
| `src/components/trading/ExpressPage.tsx` | Redesigned express trade |
| `src/components/order/OrderProofFlow.tsx` | Full TLSN proof collection + submission UI |
| `src/components/order/OrderStatusBadge.tsx` | Order status pill |
| `src/components/order/OrderTimeline.tsx` | Step-by-step order progress |
| `src/lib/proof/wiseProof.ts` | Ported from demo: Wise proof generation helpers |
| `src/lib/proof/alipayProof.ts` | Ported from demo: Alipay proof generation helpers |
| `src/lib/proof/index.ts` | Barrel export for proof module |
| `src/constants/design.ts` | Design token constants (mirrors CSS vars) |
| `src/constants/assets.ts` | Supported crypto/fiat assets list |
| `src/constants/platforms.ts` | PLATFORM_WISE, PLATFORM_ALIPAY constants |

---

## 4. Module Descriptions

### 4.1 Design Foundation (`globals.css` + `constants/design.ts`)

**Purpose:** Single source of truth for all visual tokens. Every component reads from CSS variables; no hardcoded colors anywhere.

**`src/app/globals.css`** — Complete rewrite:
```css
:root {
  /* Backgrounds */
  --bg-base: #0B0E11;
  --bg-surface: #1E2329;
  --bg-elevated: #2B3139;
  --bg-hover: #363D45;

  /* Brand */
  --color-primary: #F0B90B;
  --color-primary-hover: #D9A808;
  --color-primary-text: #0B0E11;

  /* Trade colors */
  --color-buy: #0ECB81;
  --color-buy-bg: rgba(14,203,129,0.1);
  --color-sell: #F6465D;
  --color-sell-bg: rgba(246,70,93,0.1);

  /* Text */
  --text-primary: #EAECEF;
  --text-secondary: #848E9C;
  --text-tertiary: #5E6673;

  /* Borders */
  --border-default: #2B3139;
  --border-active: #F0B90B;
  --border-subtle: #1E2329;

  /* Status */
  --status-success: #0ECB81;
  --status-success-bg: rgba(14,203,129,0.12);
  --status-danger: #F6465D;
  --status-danger-bg: rgba(246,70,93,0.12);
  --status-warning: #F0B90B;
  --status-warning-bg: rgba(240,185,11,0.12);
  --status-info: #2196F3;
  --status-info-bg: rgba(33,150,243,0.12);
  --status-muted: #848E9C;
  --status-muted-bg: rgba(132,142,156,0.12);

  /* Spacing (4px grid) */
  --space-1: 4px; --space-2: 8px; --space-3: 12px;
  --space-4: 16px; --space-5: 20px; --space-6: 24px;
  --space-8: 32px; --space-10: 40px; --space-12: 48px;

  /* Radii */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Typography */
  --font-ui: 'IBM Plex Sans', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Motion */
  --motion-fast: 120ms ease;
  --motion-mid: 200ms ease;
  --motion-slow: 280ms ease;

  /* Layout */
  --header-h: 56px;
  --tab-bar-h: 44px;
  --content-max-w: 1440px;
  --sidebar-w: 240px;
}

html, body {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.5;
}
```

**`src/constants/design.ts`** — TypeScript mirror of tokens for use in dynamic styles:
```typescript
export const colors = {
  buy: '#0ECB81',
  sell: '#F6465D',
  primary: '#F0B90B',
  // ...
} as const;
```

---

### 4.2 UI Component Library (`src/components/ui/`)

**Purpose:** Reusable, exchange-styled primitives. Every feature component builds on these. No feature-specific logic here — only visual presentation.

#### `Button.tsx`
```typescript
type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'buy' | 'sell' | 'link';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;  // default: 'primary'
  size?: ButtonSize;        // default: 'md'
  loading?: boolean;        // shows spinner, disables click
  fullWidth?: boolean;      // width: 100%
}
```

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| `primary` | `--color-primary` | `--color-primary-text` | none |
| `ghost` | transparent | `--text-primary` | `--border-default` |
| `danger` | `--color-sell` | white | none |
| `buy` | `--color-buy` | dark | none |
| `sell` | `--color-sell` | white | none |
| `link` | transparent | `--color-primary` | none |

#### `Badge.tsx`
```typescript
type BadgeVariant = 'success'|'danger'|'warning'|'info'|'muted'|'buy'|'sell';

interface BadgeProps {
  variant: BadgeVariant;
  dot?: boolean;   // show colored dot prefix
  size?: 'sm'|'md';
  children: ReactNode;
}
```
Output: `<span>` with `var(--status-{variant})` color and `var(--status-{variant}-bg)` background.

#### `Card.tsx`
```typescript
interface CardProps {
  variant?: 'default' | 'elevated' | 'bordered';
  padding?: 'sm' | 'md' | 'lg' | 'none';
  className?: string;
  children: ReactNode;
}
```
Maps variant to `--bg-surface`, `--bg-elevated`, or `--bg-surface + --border-default`.

#### `Modal.tsx`
```typescript
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}
```
Renders: backdrop overlay → centered panel → header with close button → scrollable content.
Uses CSS `backdrop-filter: blur(4px)` on overlay.

#### `Input.tsx`
```typescript
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  suffix?: ReactNode;    // for "Max" button or currency label
  prefix?: ReactNode;    // for currency icon
  error?: string;
  hint?: string;
}
```
40px height, dark background, yellow focus ring (`outline: 2px solid var(--border-active)`).

#### `Table.tsx`
```typescript
interface Column<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  render?: (value: unknown, row: T) => ReactNode;
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  stickyHeader?: boolean;
}
```
Features: client-side sort, skeleton loading rows, row hover highlight, empty state.

#### `TokenIcon.tsx`
```typescript
interface TokenIconProps {
  symbol: string;    // 'USDT', 'ETH', etc.
  size?: 'sm'|'md'|'lg';  // 16, 24, 32px
  className?: string;
}
```
Renders `/icons/{symbol.toLowerCase()}.svg` with fallback circle showing first letter.

#### `AddressDisplay.tsx`
```typescript
interface AddressDisplayProps {
  address: `0x${string}`;
  truncate?: boolean;     // show 0x1234…5678
  copyable?: boolean;     // clipboard icon
  linkToExplorer?: boolean;
}
```

---

### 4.3 Layout Layer (`src/components/layout/`)

#### `Header.tsx` (full rewrite)

**Visual reference:** Binance header bar.

**Structure:**
```
[Logo + Brand]  [Nav: Trade | Dashboard | Merchant | Admin]  [Spacer]  [WalletConnect]
```

- Height: 56px, `background: var(--bg-surface)`, border-bottom: `1px solid var(--border-default)`
- Logo: SVG zkTLS logo + "C2C Exchange" text in `--color-primary`
- Nav items: 14px, `--text-secondary` default, `--text-primary` + yellow bottom border on active
- Active detection via `usePathname()`
- WalletConnect in top-right (keeps existing component, reskinned)
- On mobile (< 768px): hamburger menu → slide-in drawer

```typescript
// Header.tsx structure
const navItems = [
  { label: 'Trade', href: '/trade/express', match: /^\/trade/ },
  { label: 'Dashboard', href: '/dashboard', match: /^\/dashboard/ },
  { label: 'Merchant', href: '/merchant', match: /^\/merchant/ },
  { label: 'Admin', href: '/admin', match: /^\/admin/ },
];
```

#### `TradingLayout.tsx` (replaces `TradingPage.tsx`)

**Visual reference:** Binance P2P sub-navigation.

**Structure:**
```
[Trading tabs: Express | P2P | Bulk]  [Quick actions: My Orders | …]
[{children}]
```

- Tab bar: 44px, flush with header, uses `Tabs` component
- Active tab: `--color-primary` bottom border + text
- Children slot renders the active trading mode's full page content

```typescript
interface TradingLayoutProps {
  activeTab: 'express' | 'p2p' | 'bulk';
  children: ReactNode;
}
```

---

### 4.4 Trading Feature Modules

#### `src/components/trading/ExpressPage.tsx` (new, replaces scattered express/ files)

**Layout:** Two-column on desktop (hero info left, trade card right), single column on mobile.

**Trade Card (Binance-style):**
```
[Buy | Sell toggle]
[I want to pay] [Amount input] [CNY ▼]
[I will receive] [Amount input] [USDT ▼]
[Rate: 1 USDT = 7.25 CNY  Refresh]
[Best price from 12 merchants]
[Trade Now →]
```

- Buy mode: "Trade Now" button uses `--color-buy`
- Sell mode: uses `--color-sell`
- Amount inputs auto-convert on change via `useTradeQuote`
- Currency selectors open a dropdown with flag + symbol

**Hero (left column):**
- Current rate display in large mono font
- 24h change indicator (green/red)
- Trust metrics: "Verified Proofs", "On-Chain Settlement"

#### `src/components/trading/P2PPage.tsx` (new, replaces `P2P_Page.tsx`)

**Layout:** Full-width, table-heavy.

**Header controls:**
```
[Buy | Sell toggle]  [USDT ▼]  [CNY ▼]  [Payment: All ▼]  [Refresh ↺]
```

**Order table columns:**
```
Merchant         |  Price       |  Available   |  Limits         |  Payment  |  Action
0x1234…5678 ✓  |  7.25 CNY   |  1,240 USDT  |  100–5,000 CNY  |  Wise     |  [Buy USDT]
```
- "Price" column: mono font, colored by buy/sell mode
- "Action" button: `--color-buy` for buy mode, `--color-sell` for sell
- Clicking action opens `PlaceOrderModal`

State flow:
```
Browsing → PlaceOrderModal open → Order confirmed →
OrderProofFlow (if CRYPTO direction: generate proof + submit) →
Redirect to /dashboard
```

---

### 4.5 Order Module (`src/components/order/`)

#### `PlaceOrderModal.tsx` (rewrite)

**New design (exchange modal):**
```
[Modal Title: Buy USDT from 0x1234…]
[Merchant info row: address, payment platform, KYB badge]
───────────────────────────────────
[You pay]   [____________ CNY] ← input
[You get]   [________ USDT]  ← auto-calculated, read-only
[Rate]      7.25 CNY/USDT
[Limits]    100 – 5,000 CNY
───────────────────────────────────
[Buyer Name] [______________] ← only for FIAT direction
[Alipay/Wise handle] [______]
───────────────────────────────────
[Cancel]  [Confirm Order →]
```

**State machine:**
1. `idle` → show form
2. `signing` → "Signing order…" spinner
3. `placing` → "Submitting to chain…" spinner
4. `success` → "Order placed! View in Dashboard" + close button
5. `error` → error message with retry

Internally: calls `useOrderFlow.placeOrder()`, then on success calls `onSuccess(orderId)`.

#### `OrderProofFlow.tsx` (new)

Handles the TLSN proof collection and on-chain submission for **CRYPTO direction** orders where the user needs to prove they sent a bank transfer.

**UI steps:**
```
Step 1: Extension detected ✓
Step 2: Select payment proof type (Wise / Alipay)
Step 3: [Generate Proof] → opens TLSN plugin, collects proof
Step 4: [Submit to Chain] → submits proof to contract
Step 5: ✓ Complete
```

Uses `useTlsnExtension` + `useContract` hooks.

#### `OrderStatusBadge.tsx` (new)

Maps order status number → human label + `Badge` variant:

| Status | Label | Variant |
|--------|-------|---------|
| 0 | PENDING | warning |
| 1 | COMPLETED | success |
| 2 | CANCELLED | muted |
| 3 | EXPIRED | muted |
| 4 | DISPUTED | danger |
| 5 | WAITING | info |

#### `OrderTimeline.tsx` (new)

Visual timeline of order lifecycle steps with icons and timestamps:
- Placed → Proof Generated → Submitted → Completed/Cancelled

---

### 4.6 Dashboard Module

#### `DashboardStats.tsx` (reskin)

**Exchange-style metric cards (4-column grid on desktop):**

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Total Orders │  │ Active Now   │  │ Completed   │  │ Volume USDT  │
│     42       │  │      3       │  │    38        │  │  12,450      │
│  +5 this wk  │  │              │  │  90.5%       │  │  +12% wk     │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

Uses `Card` component with mono font for numbers.

#### `DashboardOrdersTable.tsx` (reskin)

Reuses the new `Table` component. Columns:
- `#` (order index) | Platform | Direction | Amount | Rate | Status | Date | Action (View)

Filters: Direction (all/buy/sell), Status (all/pending/completed/cancelled), Date range.

---

### 4.7 Merchant Module

The merchant components already have correct business logic. The redesign is **visual-only**:

- Replace inline styles with CSS variable classes
- Replace custom UI elements with the new `ui/` primitives
- `ManageTab.tsx`: product management form with `Input`, `Select`, `Button` components
- `OrdersTab.tsx`: renders pending fiat orders with `OrderProofFlow` component embedded
- `MerchantStatusCard.tsx`: shows identity/KYB/balance in `Card` layout

No logic changes needed in merchant module.

---

### 4.8 Business Logic Layer (`src/lib/proof/`)

This is the most critical gap. The web's `proofTransformer.ts` is missing fields that the smart contract verifies:
- `rateVersion` (which rate snapshot was used when order was placed)
- `merchantNameHash` / `merchantIdHash` (payment account hashes)
- `payeeNameHash` / `payeeIdHash` (payer account hashes for FIAT flows)

#### `src/lib/proof/wiseProof.ts` (new)

Ported from `demo/src/utils/wiseC2cActions.ts`. Key exports:

```typescript
export const PLATFORM_WISE: `0x${string}`;  // keccak256("wise")

// Context builder — used to create the binding hash injected into plugin
export function makeWiseCryptoBindingContext(params: {
  merchantAddr: Address;
  buyerAddr: Address;
  productId: bigint;
  rateVersion: bigint;
  usdtAmount: bigint;
  fiatEstimate: bigint;
  merchantNameHash: `0x${string}`;
  merchantIdHash: `0x${string}`;
}): OrderBindingContext;

export function makeWiseFiatBindingContext(params: { /* similar */ }): OrderBindingContext;

// Plugin runner — executes Wise plugin with injected binding hash
export async function runWisePlugin(
  pluginCode: string,
  context: OrderBindingContext,
): Promise<ExtensionProveResponse>;

// Proof submitter — calls escrow contract  
export async function submitWiseCryptoProof(params: {
  walletClient: WalletClient;
  escrowAddress: Address;
  order: OrderData;
  contactsProof: ContractTLSNProof;
  transferProof: ContractTLSNProof;
}): Promise<`0x${string}`>;

export async function submitWiseFiatProof(params: { /* merchant-side */ }): Promise<`0x${string}`>;
```

#### `src/lib/proof/alipayProof.ts` (new)

Parallel to `wiseProof.ts` for Alipay platform. Key difference: single proof (not contacts + transfer).

```typescript
export const PLATFORM_ALIPAY: `0x${string}`;

export function makeAlipayCryptoBindingContext(params: { /* ... */ }): OrderBindingContext;
export function makeAlipayFiatBindingContext(params: { /* ... */ }): OrderBindingContext;
export async function runAlipayPlugin(pluginCode: string, context: OrderBindingContext): Promise<ExtensionProveResponse>;
export async function submitAlipayCryptoProof(params: { /* ... */ }): Promise<`0x${string}`>;
export async function submitAlipayFiatProof(params: { /* ... */ }): Promise<`0x${string}`>;
```

#### `src/lib/proofTransformer.ts` (update)

Sync with demo version:
- Add `rateVersion: bigint` to `OrderBindingContext`
- Add `merchantNameHash`, `merchantIdHash`, `payeeNameHash`, `payeeIdHash` fields
- Update `computeOrderBindingHash()` to include all 8 parameters
- Add `injectMerchantNameHash()`, `injectMerchantIdHash()`, `injectPayeeNameHash()`, `injectPayeeIdHash()`, `injectTransferOrderBindingHash()` sentinel injectors
- Add `recoverVerifierSignerFromProof()` for debug verification

#### `src/lib/proof/index.ts` (new)

Barrel:
```typescript
export * from './wiseProof';
export * from './alipayProof';
export * from '../proofTransformer';
```

---

### 4.9 Hook Updates

#### `useTlsnExtension.ts` (update)

Add support for the full `OrderBindingContext` including `rateVersion` and merchant/payee hashes:

```typescript
interface RunPluginOptions {
  bindingContext?: OrderBindingContext;   // full context with all hashes
  onStep?: (step: string) => void;       // progress callback for UI
}

// Also add dual-proof support for Wise
interface TlsnResult {
  proofType: 'single' | 'dual';
  singleProof?: ExtensionProveResponse;
  contactsProof?: ExtensionProveResponse;
  transferProof?: ExtensionProveResponse;
}
```

#### `useOrderFlow.ts` (update)

Add platform-aware proof submission:

```typescript
type Platform = 'wise' | 'alipay';
type OrderDirection = 'crypto' | 'fiat';

// New: submit proof after order is placed
submitProof(params: {
  platform: Platform;
  direction: OrderDirection;
  orderId: string;
  proof: TlsnResult;
}): Promise<void>;
```

---

### 4.10 Constants Module (`src/constants/`)

#### `src/constants/assets.ts`

```typescript
export const CRYPTO_ASSETS = [
  { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
] as const;

export const FIAT_ASSETS = [
  { symbol: 'CNY', name: 'Chinese Yuan', flag: '🇨🇳' },
  { symbol: 'MYR', name: 'Malaysian Ringgit', flag: '🇲🇾' },
  { symbol: 'TWD', name: 'New Taiwan Dollar', flag: '🇹🇼' },
] as const;
```

#### `src/constants/platforms.ts`

```typescript
import { keccak256, toBytes } from 'viem';

export const PLATFORM_WISE = keccak256(toBytes('wise')) as `0x${string}`;
export const PLATFORM_ALIPAY = keccak256(toBytes('alipay')) as `0x${string}`;

export const PLATFORMS = {
  wise: { id: PLATFORM_WISE, label: 'Wise', icon: 'wise' },
  alipay: { id: PLATFORM_ALIPAY, label: 'Alipay', icon: 'alipay' },
} as const;
```

---

## 5. Module Relationships

```
app/layout.tsx
└── providers/AppQueryProvider.tsx   (React Query)
└── components/layout/Header.tsx
    └── components/WalletConnect.tsx
        └── hooks/useWallet.ts
            └── lib/walletDiscovery.ts

app/trade/express/page.tsx
└── components/layout/TradingLayout.tsx   (tab nav)
└── components/trading/ExpressPage.tsx
    └── hooks/useTradeQuote.ts
        └── hooks/queries/useRateQuery.ts
            └── lib/apiClient.ts → /api/price
    └── components/order/PlaceOrderModal.tsx
        └── hooks/useOrderFlow.ts
            └── lib/eip712.ts
            └── lib/contractSubmitter.ts
                └── lib/contractConfig.ts
                └── lib/contractAbi.ts
        └── hooks/useWallet.ts

app/trade/p2p/page.tsx
└── components/layout/TradingLayout.tsx
└── components/trading/P2PPage.tsx
    └── components/p2p/P2PFilters.tsx
    └── components/p2p/P2POrderTable.tsx
        └── hooks/queries/useOrderListQuery.ts
    └── components/order/PlaceOrderModal.tsx  (same as above)
    └── components/order/OrderProofFlow.tsx  (for CRYPTO orders)
        └── hooks/useTlsnExtension.ts
            └── lib/proof/wiseProof.ts    (runWisePlugin)
            └── lib/proof/alipayProof.ts  (runAlipayPlugin)
            └── lib/proofTransformer.ts   (buildContractProof)
        └── hooks/useContract.ts
            └── lib/contractSubmitter.ts

app/dashboard/page.tsx
└── components/dashboard/DashboardStats.tsx
    └── hooks/queries/useDashboardQuery.ts
└── components/dashboard/DashboardOrdersTable.tsx
    └── hooks/queries/useOrderListQuery.ts
└── components/ui/Table.tsx

app/merchant/page.tsx
└── components/MerchantPanel.tsx
    └── components/merchant/MerchantTabBar.tsx
    └── components/merchant/ListProductTab.tsx
        └── hooks/useProducts.ts
        └── hooks/useAdminContract.ts
    └── components/merchant/ManageTab.tsx
        └── hooks/useOrderFlow.ts
    └── components/merchant/OrdersTab.tsx
        └── hooks/queries/useOrderListQuery.ts
        └── components/order/OrderProofFlow.tsx   (merchant submits fiat proofs)
    └── components/merchant/RegisterSection.tsx

app/admin/page.tsx
└── components/admin/AdminConsole.tsx
    └── components/admin/RegisterMerchantForm.tsx
    └── components/admin/CryptoAssetTable.tsx
    └── components/admin/FiatAssetTable.tsx
    └── hooks/useAdminContract.ts

Shared UI layer (used everywhere):
components/ui/Button.tsx
components/ui/Badge.tsx
components/ui/Card.tsx
components/ui/Modal.tsx
components/ui/Input.tsx
components/ui/Select.tsx
components/ui/Table.tsx
components/ui/Spinner.tsx
components/ui/Tabs.tsx
components/ui/TokenIcon.tsx
components/ui/AddressDisplay.tsx
```

**Data flow summary:**

```
User Action → React Component
  → Custom Hook (useOrderFlow / useTlsnExtension)
    → lib/proof/* (proof generation helpers)
      → window.tlsn.execCode() (TLSN extension)
        → proof artifact
    → lib/contractSubmitter.ts (on-chain submission)
      → lib/contractAbi.ts + lib/contractConfig.ts
        → blockchain confirmation
  → hooks/queries/* (React Query cache invalidation)
    → lib/apiClient.ts (API route)
      → server/database.ts (off-chain DB sync)
```

---

## 6. TODO List (Phases)

### Phase 1: Design Foundation (Day 1)
_No business logic changes. Pure visual layer._

- [ ] **1.1** Rewrite `src/app/globals.css` with all 40+ design tokens
- [ ] **1.2** Update `src/app/layout.tsx` — clean up font imports, set IBM Plex Sans + JetBrains Mono
- [ ] **1.3** Create `src/constants/design.ts` — TypeScript token mirror
- [ ] **1.4** Create `src/components/ui/Button.tsx` — 5 variants + size + loading
- [ ] **1.5** Create `src/components/ui/Badge.tsx` — 7 semantic variants + dot option
- [ ] **1.6** Create `src/components/ui/Card.tsx` — 3 surface variants
- [ ] **1.7** Create `src/components/ui/Modal.tsx` — overlay + panel + close button
- [ ] **1.8** Create `src/components/ui/Input.tsx` — label/prefix/suffix/error
- [ ] **1.9** Create `src/components/ui/Select.tsx`
- [ ] **1.10** Create `src/components/ui/Table.tsx` — sortable + loading + empty state
- [ ] **1.11** Create `src/components/ui/Spinner.tsx`
- [ ] **1.12** Create `src/components/ui/Tabs.tsx`
- [ ] **1.13** Create `src/components/ui/TokenIcon.tsx`
- [ ] **1.14** Create `src/components/ui/AddressDisplay.tsx`
- [ ] **1.15** Delete old `src/components/ui/` files (ActionButton, MetricChip, SectionHeader, StatusPill, SurfaceCard)

### Phase 2: Layout & Navigation (Day 1-2)

- [ ] **2.1** Full rewrite of `src/components/Header.tsx` — exchange nav bar
- [ ] **2.2** Reskin `src/components/WalletConnect.tsx` — exchange button style
- [ ] **2.3** Create `src/components/layout/TradingLayout.tsx` — replaces TradingPage.tsx
- [ ] **2.4** Create `src/components/layout/Footer.tsx` — minimal footer
- [ ] **2.5** Delete `src/components/TradingPage.tsx`
- [ ] **2.6** Update `src/app/trade/express/page.tsx` to use TradingLayout
- [ ] **2.7** Update `src/app/trade/p2p/page.tsx` to use TradingLayout
- [ ] **2.8** Update `src/app/trade/bulk/page.tsx` to use TradingLayout

### Phase 3: Trading Pages Redesign (Day 2-3)

- [ ] **3.1** Create `src/components/trading/ExpressPage.tsx`
  - Two-column layout (hero + trade card)
  - Buy/Sell toggle with color change
  - Currency pair selector
  - Amount inputs with real-time conversion (useTradeQuote)
  - "Trade Now" button → PlaceOrderModal
- [ ] **3.2** Create `src/components/trading/P2PPage.tsx`
  - Filter bar (Buy/Sell, crypto, fiat, payment method)
  - Order table using `Table` component
  - "Buy USDT" / "Sell USDT" action buttons
  - Click → PlaceOrderModal
- [ ] **3.3** Delete `src/components/ExpressPage.tsx` and `src/components/P2P_Page.tsx`
- [ ] **3.4** Update `express/ExpressHero.tsx` + `express/ExpressTradeCard.tsx` OR remove and inline in new ExpressPage.tsx

### Phase 4: Order Module Redesign (Day 3-4)

- [ ] **4.1** Full rewrite of `src/components/PlaceOrderModal.tsx`
  - New exchange modal design
  - Merchant info row with AddressDisplay
  - Pay/receive inputs with auto-calculation
  - Buyer name/handle fields for FIAT only
  - Status states with Spinner
  - Uses `useOrderFlow` hook
- [ ] **4.2** Create `src/components/order/OrderProofFlow.tsx`
  - Step indicator (5 steps)
  - Platform selector (Wise / Alipay)
  - "Generate Proof" button → TLSN plugin execution
  - "Submit Proof" button → contract call
  - Progress display with useTlsnExtension
- [ ] **4.3** Create `src/components/order/OrderStatusBadge.tsx`
- [ ] **4.4** Create `src/components/order/OrderTimeline.tsx`
- [ ] **4.5** Reskin `src/components/TlsnVerifyButton.tsx` (or deprecate in favor of OrderProofFlow)
- [ ] **4.6** Reskin `src/components/ProofStatus.tsx`

### Phase 5: Business Logic Completion (Day 4-5)

- [ ] **5.1** Create `src/lib/proof/wiseProof.ts` — port from demo
  - `PLATFORM_WISE` constant
  - `makeWiseCryptoBindingContext()` with rateVersion + hashes
  - `makeWiseFiatBindingContext()`
  - `runWisePlugin()` with full injection
  - `submitWiseCryptoProof()` / `submitWiseFiatProof()`
- [ ] **5.2** Create `src/lib/proof/alipayProof.ts` — port from demo
- [ ] **5.3** Create `src/lib/proof/index.ts`
- [ ] **5.4** Update `src/lib/proofTransformer.ts`
  - Add `rateVersion` to `OrderBindingContext`
  - Add merchant/payee hash fields
  - Update `computeOrderBindingHash()` signature
  - Add all sentinel injector functions
  - Add `recoverVerifierSignerFromProof()`
- [ ] **5.5** Update `src/hooks/useTlsnExtension.ts`
  - Add `RunPluginOptions.bindingContext` full interface
  - Add dual-proof (Wise contacts + transfer) support
  - Export `TlsnResult` type
- [ ] **5.6** Update `src/hooks/useContract.ts`
  - Add `submitWiseCryptoProof` action
  - Add `submitWiseFiatProof` action
  - Add `submitAlipayCryptoProof` action
  - Add `submitAlipayFiatProof` action
- [ ] **5.7** Update `src/hooks/useOrderFlow.ts`
  - Add `submitProof()` function with platform/direction dispatch
- [ ] **5.8** Create `src/constants/platforms.ts`
- [ ] **5.9** Create `src/constants/assets.ts`

### Phase 6: Dashboard & Supporting Pages (Day 5-6)

- [ ] **6.1** Reskin `src/components/dashboard/DashboardStats.tsx` — 4-col metric grid
- [ ] **6.2** Reskin `src/components/dashboard/DashboardOrdersTable.tsx` — use new Table component
- [ ] **6.3** Update `src/app/dashboard/page.tsx` — direction filter, sync status
- [ ] **6.4** Update `src/components/orders/OrderDetailPageClient.tsx` — add OrderTimeline

### Phase 7: Merchant & Admin Reskin (Day 6-7)

- [ ] **7.1** Reskin `src/components/merchant/MerchantStatusCard.tsx`
- [ ] **7.2** Reskin `src/components/merchant/RegisterSection.tsx`
- [ ] **7.3** Reskin `src/components/merchant/ListProductTab.tsx`
- [ ] **7.4** Reskin `src/components/merchant/ManageTab.tsx`
- [ ] **7.5** Reskin `src/components/merchant/OrdersTab.tsx` — wire OrderProofFlow for fiat orders
- [ ] **7.6** Reskin `src/components/MerchantPanel.tsx` — use Card + Tabs
- [ ] **7.7** Reskin `src/components/admin/AdminConsole.tsx`
- [ ] **7.8** Reskin `src/components/admin/RegisterMerchantForm.tsx`
- [ ] **7.9** Reskin `src/components/admin/CryptoAssetTable.tsx`
- [ ] **7.10** Reskin `src/components/admin/FiatAssetTable.tsx`

### Phase 8: Integration & Polish (Day 7-8)

- [ ] **8.1** End-to-end test: Express trade flow (place order → proof → submit)
- [ ] **8.2** End-to-end test: P2P order flow
- [ ] **8.3** End-to-end test: Merchant fiat proof flow
- [ ] **8.4** Error state handling across all components
- [ ] **8.5** Loading skeleton states for all data-fetching components
- [ ] **8.6** Mobile responsiveness check (375px, 768px)
- [ ] **8.7** Accessibility audit (contrast, focus states, aria-labels)
- [ ] **8.8** `prefers-reduced-motion` media query check

---

## 7. Key Design Decisions

### Why Binance-style and not custom?

The user is a C2C exchange targeting crypto traders. This audience has Binance/OKX muscle memory. A Binance-inspired interface reduces cognitive friction: users immediately know where to look. The gold primary (`#F0B90B`) differentiates from Binance's yellow while remaining in the same trust register.

### Why modular `lib/proof/` instead of inline?

The proof generation logic (binding hash computation, plugin injection, contract submission) is independently testable and reusable across multiple UI components (user order proof, merchant fiat proof). Centralizing it in `lib/proof/` makes future platform additions (PayNow, GCash) a matter of adding one file without touching components.

### Why keep existing hooks instead of rewriting?

`useWallet`, `useTradeQuote`, `useContract`, and all query hooks are architecturally sound — they abstract the correct boundaries. Rewriting them would risk regressions in business logic. The changes are additive (new function exports) not structural.

### Why NOT use shadcn/ui or another component library?

Adding a third-party component library would fight against the custom CSS variable system already established in globals.css. The exchange dark theme is specific enough that a custom mini-library of ~12 components is faster and results in a more cohesive look than theming an external library.

---

## 8. Appendix: Implementation Prompt

Use the following prompt in a **new Claude Code window** to implement this plan:

---

```
You are implementing a production-grade redesign of the zkTLS C2C Exchange web application located at:

  d:\c2c_platform\testing\tlsn-extension\packages\web

## Your First Step

Read the implementation plan file:
  d:\c2c_platform\testing\tlsn-extension\packages\web\WEB_REDESIGN_PLAN.md

This document is your complete specification. Follow it exactly.

## Working Rules

1. Work phase by phase (Phase 1 → Phase 2 → … → Phase 8). Complete each phase fully before moving on.
2. For every new file you create, read at least one related existing file first to understand naming conventions and import patterns.
3. When "reskinning" an existing component, preserve ALL existing logic (state, hooks, event handlers). Only change:
   - CSS class names → CSS variable references
   - Hardcoded colors → CSS variable tokens
   - Old ui/ component imports → new ui/ components
   - Layout/structure to match exchange design
4. Never delete a file until its replacement is working.
5. After completing Phase 5 (Business Logic), verify: does `lib/proofTransformer.ts` now include `rateVersion` in `OrderBindingContext`? Does `computeOrderBindingHash(ctx: OrderBindingContext)` correctly encode all 15 fields including rateVersion, merchantNameHash, merchantIdHash, payeeNameHash, and payeeIdHash?
6. Use TypeScript strict mode. No `any` types unless already present in the existing file.
7. All new JSX files must use React functional components with named exports.
8. No inline styles. Use CSS variable classes only (var(--token-name)).

## Design Reference

The visual target is Binance P2P dark theme:
- Background: #0B0E11
- Cards/surfaces: #1E2329
- Primary accent: #F0B90B (gold)
- Buy actions: #0ECB81 (green)
- Sell actions: #F6465D (red)
- Text: #EAECEF / #848E9C (muted)
- Borders: #2B3139

All tokens are defined in the plan's globals.css section. Use them as CSS variables.

## Critical Files to Read Before Starting

Before any code changes, read these files to understand the existing patterns:
- src/hooks/useWallet.ts
- src/hooks/useOrderFlow.ts
- src/hooks/useTlsnExtension.ts
- src/lib/proofTransformer.ts
- src/lib/contractAbi.ts
- src/components/p2p/types.ts
- src/components/p2p/orderLifecycle.ts

For business logic porting, read these demo files:
- packages/demo/src/utils/wiseC2cActions.ts
- packages/demo/src/utils/alipayC2cActions.ts
- packages/demo/src/utils/proofTransformer.ts  (demo version — more complete)

## Start

Begin with Phase 1. Read WEB_REDESIGN_PLAN.md, then implement each todo item in order. Mark completed items clearly in your reasoning. After Phase 5, pause and verify the proof logic is correct before proceeding to Phase 6.
```

---

*End of plan — total estimated implementation time: 7–8 working days for all 8 phases.*

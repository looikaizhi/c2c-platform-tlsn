# @tlsn/keeper

Off-chain keeper service that watches `C2CEscrow` for placed orders and triggers
`sweepExpiredBatch` on the contract after each order's `deadline + GRACE_PERIOD`.

The contract is the source of truth — `sweepExpired` is permissionless, so a
keeper outage never blocks cleanup; users or any other EOA can call it manually.

## Quick start (WSL)

```bash
# Terminal 1 — start hardhat node
cd /mnt/d/c2c_platform/testing/tlsn-extension/packages/contracts
npx hardhat node --network hardhatMainnet

# Terminal 2 — deploy (writes deployments/<chainId>.json)
cd /mnt/d/c2c_platform/testing/tlsn-extension/packages/contracts
npm run deploy:web

# Terminal 3 — run keeper (auto-detects escrow from deployments file)
cd /mnt/d/c2c_platform/testing/tlsn-extension/packages/keeper
cp .env.example .env       # ESCROW_ADDRESS left commented = auto-discover
npm run dev
```

## Escrow address discovery

On startup the keeper resolves the escrow contract using this precedence:

1. `ESCROW_ADDRESS` env var — full override.
2. `KEEPER_DEPLOYMENTS_FILE` env var — path to a deployments JSON.
3. Default: `../contracts/deployments/<KEEPER_LABEL>-<CHAIN_ID>.json`
   (e.g. `web-31337.json`).
4. Fallback: legacy `../contracts/deployments/<CHAIN_ID>.json`.

`KEEPER_LABEL` defaults to `web`. A fresh `npm run deploy:web` (or
`deploy:demo`) is enough to pick up the new escrow — no need to edit `.env`.
The `deploymentBlock` is also pulled from the file so event replay skips
pre-deploy blocks.

## Multi-keeper (web + demo at the same time)

The web and demo deploy scripts both produce **separate** escrow contracts on
the same chain (`web-<chainId>.json` and `demo-<chainId>.json`). Spin up one
keeper instance per label — each with its own port, state file, and account.

```bash
# Terminal A — web keeper (default)
cp .env.example .env       # KEEPER_LABEL=web, HEALTH_PORT=9091, account[19]
npm run dev

# Terminal B — demo keeper
cp .env.demo.example .env.demo  # KEEPER_LABEL=demo, HEALTH_PORT=9092, account[18]
npm run dev:demo
```

Each instance writes a separate state file (`state.json` vs
`state-demo.json`) and serves health on its own port (9091 vs 9092). They
share the same RPC connection but use distinct keeper accounts so nonces
don't collide.

## Scripts

- `npm run dev` — run with tsx (no build step)
- `npm run build` — emit dist/
- `npm run start` — node dist/index.js (production)
- `npm test` — vitest unit tests
- `npm run lint` — eslint + prettier + tsc --noEmit

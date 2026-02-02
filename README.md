# Sovry

Sovry is a launchpad for Story Protocol IP assets.

Creators lock a fixed amount of their **Story Protocol Royalty Tokens (RT)** into the Launchpad (currently **100 RT per launch**), which deploys a branded ERC‑20 **wrapper token** and sells it on a bonding curve. When the raise target is hit, the wrapper graduates to a **PiperX V3** pool. The LP position is minted as an NFT and custody is held by the Exchange. All fees (trade, royalties, DEX) are split **50% treasury / 50% IP Asset**.

---

## 🏗 Architecture

- **Blockchain**: Story Protocol – Aeneid Testnet (chainId `1315`)
- **Core Contracts** (Aeneid):
  - `SovryFactory.sol` – launching (nonpayable, no launch fee; delegates to Exchange)
  - `SovryExchange.sol` – bonding curve vault (trading, graduation, keeper harvest, LP NFT custody)
  - `SovryRouter.sol` – user gateway for common write actions
  - `SovryToken.sol` – ERC‑20 wrapper token deployed per launch
- **Deployed Addresses (Aeneid testnet)**
  - Factory (launchpad): `0x2eC6513800426cA9B3530bd04cdB5A8f47c9C038`
  - Exchange: `0xc7E8fc2C1da57eB7103bdf180B5D82E24e5e3d8D`
  - Router: `0xa3B5471F43FFac986E66100E901D6cb4247D12C9`
  - Royalty Workflows: `0x9515faE61E0c0447C6AC6dEe5628A2097aFE1890`
  - PiperX V3 Router: `0x8295c195CEe31404ea082d253a140310b9a0A37e`
- **Frontend**: Next.js + TypeScript (App Router) in `frontend/`
  - `/` – Launch gallery (from Goldsky subgraph + metadata)
  - `/create` – Launch existing IP from Story (Get RT → Configure → Launch)
  - `/profile` – Portfolio + creator dashboard (royalty claim + WIP transfer)
  - `/pool/[address]` – Trading terminal (chart + buy/sell)
- **Wallet**: Dynamic.xyz (EVM connectors only, via `frontend/src/app/providers.tsx`)
- **Indexing**: Goldsky subgraph indexing `SovryFactory` + `SovryExchange` events
- **Story Protocol Integration**:
  - Story SDK client + HTTP API for IP assets, royalty vaults, and `claimAllRevenue`
- **Storage / Social**:
  - Supabase for `profiles`, `launches`, `comment` tables
  - Pinata (IPFS) for wrapper token logos + metadata JSON

---

## ⚙️ Smart Contracts (Aeneid)

> All details below reflect the current Aeneid deployment used for the hackathon.

### Core Contracts

- **Factory – `SovryFactory`**
  - Nonpayable launch entrypoint (no launch fee)
  - Calls `SovryExchange.launchTokenFromFactory(...)`
  - Emits `TokenLaunched(rt, wrapper, creator, amount, launchTime)`

- **Exchange – `SovryExchange`**
  - Holds locked **Royalty Tokens (RT)** and mints the wrapper supply
  - Runs a **linear bonding curve** (buy/sell)
  - **Trade fee**: **1% total (100 bps)** → **0.5% treasury / 0.5% IP Asset**
    - Treasury share is queued to `pendingWithdrawals`
    - IP Asset share is **queued in `accumulatedRoyaltyNative`** and only delivered once the keeper wraps to WIP via `processRevenue`
  - Graduation (PiperX V3):
    - Extracts **10%** of native reserve pre-LP; split **50% treasury / 50% IP Asset** (IPA portion is also queued as native royalty revenue)
    - Mints V3 LP position; stores LP NFT tokenId; marks wrapper graduated; unlocks transfers; renounces wrapper ownership
  - **Royalties + DEX fees**: all ERC20 tokens (WIP / wrapper) split **50% treasury / 50% IP Asset** via keeper-only `depositRoyalties`, `collectDexFees`, and the new `processRevenue` (native → WIP + `payRoyaltyOnBehalf`)

- **Router – `SovryRouter`**
  - Convenience gateway for UI:
    - `launchToken(...)` → Factory
    - `buyETH(...)` / `sell(...)` → Exchange

- **Wrapper Token – `SovryToken`**
  - Deployed by Exchange via `new SovryToken(name, symbol, rtAddress, exchange)`
  - 18 decimals; used purely as the tradeable wrapper around locked RT
  - Minting/burning controlled by the Exchange; public wrapping is disabled

Key on‑chain behaviours:

- **Launch / Wrapper Pattern**
  - `Factory.launchToken(rtAddress, amount, ipAsset, name, symbol)`
    - Calls `Exchange.launchTokenFromFactory(...)`
    - Exchange enforces a fixed launch lock amount (`amount == 100 RT`)
    - Deploys a new `SovryToken` wrapper (`wrapperAddress`) and mints the fixed wrapper supply (18 decimals)
    - Stores mapping `rtToWrapper[rt] -> wrapper` and `wrapperToRt[wrapper] -> rt`
    - Emits `TokenLaunched(rt, wrapper, creator, amount, launchTime)`


- **Launch Amount**
  - Launch amount is currently **fixed** at `100 RT` and enforced by the Exchange.

- **Bonding Curve**
  - Buy path (UI): `Router.buyETH(wrapperToken, amount, maxEthCost, deadline)`
    - Linear curve using `basePrice` and `priceIncrement`
    - Collects 1% fee from base cost, split 50/50 treasury/IP Asset
    - Updates `BondingCurve.currentSupply` and `reserveBalance`
    - Emits `TokensPurchased(buyer, wrapperToken, amount, baseCost, feeAmount, feeRecipient)`
  - Sell path (UI): `Router.sell(wrapperToken, amount, minEthProceeds, deadline)`
    - Sells along the same linear curve
    - 1% fee split 50/50 treasury/IP Asset, emits `TokensSold(seller, wrapperToken, amount, baseProceeds, feeAmount, feeRecipient)`
  - `calculateBuyPrice` / `calculateSellPrice` are exposed as view helpers

- **Harvest (Pull Model)**
  - Native trade fees accrue per token in `accumulatedRoyaltyNative` (IPA share of fees)
  - Keeper jobs:
    - `harvestFromVault(wrapperToken)` – pull Story vault revenue + convert IPA share depending on graduation state
    - `pushFeesToVault(wrapperToken)` – push accumulated native IPA fees to Story vault
    - (Optional) `collectDexFees` for LP fees when graduated
  - Emits:
    - `RoyaltyRevenueQueued` / `RoyaltyRevenueProcessed` (push path)
    - `RevenueHarvested` (pull harvest, pre/post grad)
    - `BuybackExecuted` (post-grad buyback of WIP)

- **Redeem (Burn wrapper → withdraw RT)**
  - Users can call `Exchange.redeem(wrapperToken, wrapperAmount, recipient)`
  - RT returned is pro-rata: `rtAmount = wrapperAmount * totalLocked / totalSupply`
  - Emits `TokensRedeemed(redeemer, wrapperToken, wrapperAmount, rtAmount, recipient)`

- **Graduation to PiperX V3**
  - Exchange tracks reserves and market cap; when above `graduationThreshold` for a delay,
    `_checkGraduation` triggers `_graduate` (see contract for details):
    - Adds liquidity on PiperX V3 via PositionManager; receives LP NFT (tokenId) and stores it
    - Marks `launchedTokens[wrapper].graduated = true`, unlocks wrapper transfers, renounces wrapper ownership
    - Emits `Graduated(wrapperToken, liquidity, poolAddress)` and LP tokenId is queryable via `lpTokenIds(wrapper)`
  - **Fallback:** if LP mint fails, wrapper + ETH liquidity go to treasury and graduation still emits with `poolAddress=0` (no LP)

---

## 🌐 Frontend Apps

### `frontend/` – Next.js App Router

- **Navigation**
  - `Home` – `/`
  - `Create` – `/create`
  - `Profile` – `/profile`

- **Home (`/`) – Launch Gallery**
  - Reads **WrapperToken** entities from the Goldsky subgraph
  - Enriches with metadata from Supabase (`launches` table) and Story IP data
  - Shows wrapper address, creator, launch time, market cap and curve stats
  - Clicking a card routes to `/pool/[address]` for trading

- **Create (`/create`) – Launch Existing IP**
  - Fetch IP assets owned by the connected wallet via Story API (`fetchWalletIPAssets`)
  - For each IP, detect if a **royalty vault** exists and whether it has RTs
  - Optional **Get Royalty Tokens** step:
    - Transfers RTs from the IP Account to the creator wallet via Story SDK (`transferRoyaltyTokensFromIP`)
  - Configure Launch:
    - Wrapper **name & symbol** (auto‑suggested from IP metadata, editable)
  - Launch on Bonding Curve:
    - Under the hood: approves `SovryExchange` for `100 RT` and calls `Router.launchToken`
  - After launch, metadata for the wrapper is pinned to IPFS (Pinata) and mirrored into Supabase

- **Profile (`/profile`) – Portfolio & Creator Console**
  - **Header**: wallet address, username/bio/avatar from Supabase `profiles`
  - **Tokens launched** (creator view):
    - Pulled from subgraph (`WrapperToken.creator == wallet`)
    - Shows symbol, name, on‑chain balance, and **Available to Harvest (WIP)**
    - `Available to Harvest (WIP)` is computed from Story royalty vault WIP balance via `getClaimableRoyaltyForIp`
    - Actions per token:
      - **Claim** – claims Story revenue to the wallet/IP account and transfers WIP to the Exchange
        - The keeper will later run `Exchange.harvest(wrapperToken)`
  - **Your holdings** (investor view):
    - Queries all wrapper tokens from subgraph, then reads per‑wrapper ERC‑20 balances
    - Shows list of tokens the wallet holds and links to `/pool/[address]` for trading

- **Pool Detail (`/pool/[address]`) – Trading Terminal**
  - Left: bonding curve chart (from subgraph `Candle` entities) + IP metadata + comments (if Supabase enabled)
  - Right:
    - Bonding curve progress vs graduation threshold
    - Trade widget (bonding‑curve buy/sell via `buy` / `sell`)
    - Notes:
      - Royalty harvest is performed by a keeper (not directly from the UI)

---

## 📊 Subgraph (Factory + Exchange)

Directory: `subgraph/`

- **Data Sources**: `SovryFactory` + `SovryExchange` on Story Aeneid
- **Tracked Events (see `subgraph/subgraph.yaml`)**:
  - `TokenLaunched(address rt, address wrapper, address creator, uint256 amount, uint256 launchTime)`
  - `TokensPurchased(address buyer, address wrapperToken, uint256 amount, uint256 baseCost, uint256 feeAmount, address feeRecipient)`
  - `TokensSold(address seller, address wrapperToken, uint256 amount, uint256 baseProceeds, uint256 feeAmount, address feeRecipient)`
  - `TokensRedeemed(address redeemer, address wrapperToken, uint256 wrapperAmount, uint256 rtAmount, address recipient)`
  - Pull/Push revenue events: `RoyaltyRevenueQueued`, `RoyaltyRevenueProcessed`, `RevenueHarvested`, `BuybackExecuted`
  - `Graduated(address wrapperToken, uint256 liquidity, address poolAddress)`
  - `GraduationThresholdUpdated(uint256 newThreshold)`

Core entities in `schema.graphql`:

- `Launchpad` – aggregate stats (totalTokens, totalTrades, totalVolume, totalFees)
- `WrapperToken` – one per launched wrapper (creator, launchTime, totalLocked, dexReserve, initialCurveSupply, totalRoyaltiesHarvested, poolAddress, totalHarvestedAmount, totalFeesPushed)
- `RevenueEvent` – normalized push/pull revenue events (type: PUSH / HARVEST_RESERVE / HARVEST_BUYBACK)
- `HarvestEvent` / `BuybackEvent` – per-harvest and per-buyback details
- `TokenStat` / `ProtocolMetric` – per-token and protocol aggregates
- `Trade`, `Holder`, `Candle`, etc. for UI analytics

The Goldsky subgraph is used by the **Home** grid, **Pool** charts, and **Profile** page.

---

## 🔐 Environment Variables

### Root `.env` / `.example.env`

Used for scripts and subgraph tooling (non‑frontend):

```bash
# Owner / deployer
OWNER_ADDRESS="0x8c317fb91a73e2c8d4883dded3981982f046f733"

# RPC / explorer access
NEXT_PUBLIC_AENEID_RPC_URL="https://aeneid.storyrpc.io"
TENDERLY_USERNAME="..."        # optional
TENDERLY_PROJECT="..."         # optional

# Goldsky subgraph endpoint (Aeneid)
GOLDSKY_ENDPOINT="https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/sovry-aeneid/1.0.1/gn"
```

### Frontend `frontend/.env.local` (or `.env`)

Copy from `frontend/.example.env` and fill:

```bash
## RPC / explorer access
NEXT_PUBLIC_TENDERLY_RPC_URL="https://story-aeneid.gateway.tenderly.co"
NEXT_PUBLIC_STORY_RPC_URL="https://aeneid.storyrpc.io"
NEXT_PUBLIC_STORY_API_KEY=""

## Third-party services
NEXT_PUBLIC_API_URL="http://localhost:3001"
GRAPH_WEBHOOK_SECRET=<same secret as keeper bot>
NEXT_PUBLIC_SUBGRAPH_URL="https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/sovry-aeneid/1.0.1/gn"
NEXT_PUBLIC_SUPABASE_URL="https://cupllnxfdbxfigzrmqjy.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase anon key>
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=""   # Dynamic env id
NEXT_PUBLIC_ENABLE_DEBRIDGE_WIDGET="true"

## Sovry Factory (Aeneid)
NEXT_PUBLIC_LAUNCHPAD_ADDRESS="0x2eC6513800426cA9B3530bd04cdB5A8f47c9C038"
NEXT_PUBLIC_BASE_PRICE_WEI="100000000000"
NEXT_PUBLIC_PRICE_INCREMENT_WEI="2000000"
NEXT_PUBLIC_DEMO_ROYALTY_AMOUNT_WEI="1000000000000000000"
```

> **Tip:** Never commit real API keys or private keys. Only `.example.env` with placeholders is versioned.

---

## 🚀 Development

From **project root**:

```bash
# Install all workspace dependencies (contracts, frontend, subgraph, backend)
npm install

# Run frontend + backend together
npm run dev          # frontend: http://localhost:3000, backend: http://localhost:3001

# Or only frontend
npm run dev:frontend

# Or only backend API (if you use it)
npm run dev:backend
```

Subgraph (Goldsky / The Graph):

> **Node requirement:** Graph CLI requires Node.js **>= 20.18.1** for `subgraph` codegen/build.

```bash
# from project root
npm run subgraph:codegen
npm run subgraph:build
# deploy via Goldsky UI / CLI using the endpoint above
```

Contracts (Hardhat, in `contracts/` workspace):

```bash
# compile & run full local test suite
npm run compile
npm test

# deploy Sovry Protocol (Factory/Exchange/Router) to Aeneid (uses contracts/scripts/deploy-launchpad.ts)
npm run deploy:launchpad
```

### Deploy (Contracts)

```bash
cd contracts
npm run deploy:launchpad -- --network aeneid
```

- If `STORYSCAN_API_KEY` is set (and `SKIP_AUTO_VERIFY` != `true`), `scripts/deploy-launchpad.ts` will automatically call Hardhat's `verify:verify` against Storyscan for BondingCurveLib, SovryExchange, SovryFactory, and SovryRouter.
- To manually verify any contract:

```bash
npx hardhat verify --network <network> <address> <constructor_args>
```

- Curve defaults (`CURVE_BASE_PRICE_WEI`, `CURVE_PRICE_INCREMENT_WEI`) are read from the environment and finalized automatically during deployment (one-time). Adjust these env vars before running `npm run deploy:launchpad` if you need different bonding curve pricing.

Below is the development roadmap for Sovry, focused on pivoting from a standard AMM to a Bonding Curve Launchpad model.

### Phase 1: Foundation & Smart Contracts (The Pivot) 🏗️
**Focus:** Replacing the old DEX infrastructure with the new Bonding Curve Launchpad engine.

- [x] **Architecture Design**
  - Pivot from AMM Model (Factory/Router) to Bonding Curve Model (Launchpad).
  - Set Graduation Target to **PiperX V2** (Major Story Protocol DEX).

- [x] **Smart Contract Development**
  - `SovryToken.sol`: Implement a standard, mintable/burnable ERC-20 Wrapper Contract.
  - `SovryFactory.sol` / `SovryExchange.sol` / `SovryRouter.sol`:
    - Split responsibilities: launch (factory), trading + vault (exchange), UX gateway (router)
    - **Trade fee:** 0.2% (20 bps) paid to creator (explicitly emitted)
    - **Graduation fee:** 10% of reserve split creator/treasury
    - **Harvest:** keeper-only `exchange.harvest(wrapper)`

- [x] **Deployment Scripts**
  - Create `scripts/deploy-launchpad.ts`.
  - Verify contracts on **StoryScan (Aeneid)**.

---

### Phase 2: Frontend Refactor (UI/UX Overhaul) 🎨
**Focus:** Transforming the UI from a "Swap Interface" to a "Social Trading Terminal".

- [x] **Legacy Code Cleanup**
  - Remove obsolete pages: Liquidity, Pools, Swap (Old).
  - Remove obsolete services calling the internal Factory/Router.

- [x] **New "Home" Page (The Gallery)**
  - Grid layout displaying newly launched tokens.
  - Cards showing: IP Image, Ticker, Market Cap, & Bonding Curve Progress.
  - Search/Filter by Name or Category.

- [x] **New "Create" Page (The Launcher)**
  - **Native Story Integration:** Fetch and preview IP assets directly from Story API, keyed by wallet owner.
  - **Transaction Flow:** Get Royalty Tokens (optional) -> Approve Exchange -> Launch via Router/Factory.

- [x] **New "Token Detail" Page (The Terminal)**
  - **Left Column:** Real-time TradingView Chart (Lightweight Charts) + IP Metadata/License Terms.
  - **Right Column:** Buy/Sell Interface (Bonding Curve) + Slippage Settings.
  - **Bottom Section:** Tabs for "Holder Distribution", "Transaction History", and "Comments".

---

### Phase 3: Data & Social Layer (Backend) 🗄️
**Focus:** Ensuring data speed and community engagement.

- [x] **Indexer (Goldsky Subgraph)**
  - `subgraph.yaml` indexes `SovryFactory` + `SovryExchange` events (TokenLaunched, TokensPurchased, TokensSold, TokensRedeemed, RoyaltiesHarvested, Graduated, GraduationThresholdUpdated).
  - Schema entities: `Launchpad`, `WrapperToken`, `Trade`, `Redemption`, `Harvest`, `Graduation`, `GraduationThresholdUpdate`, `Holder`, `Candle`.
  - Subgraph deployed to **Goldsky** at `.../subgraphs/sovry-aeneid/1.0.1/gn` and consumed by the frontend.

- [x] **Social Features (Supabase)**
  - Setup Supabase Database tables (`profiles`, `comments`).
  - Implement Real-time Comment Section on Token Detail pages.
  - Implement User Profiles (Avatar, Bio, Social Links like Twitter/Telegram).

- [x] **Real-time Data (Wagmi)**
  - Implement direct RPC Event Listeners in the frontend for instant price/chart updates (bypassing indexer delay).

---

### Phase 4: Security & Polish 🛡️
**Focus:** Security, investor trust, and platform stability.

- [x] **Security Hardening**
  - Implement **SIWE (Sign-In with Ethereum)** for Supabase authentication to prevent identity spoofing.
  - Add Slippage Protection & Max Transaction Limits in the UI.
  - Implement Rate Limiting for Social APIs.

- [x] **IP Asset Integrity**
  - Ensure all displayed metadata is fetched strictly from On-Chain/IPFS (Single Source of Truth).

- [x] **Gamification**
  - **Whale Alerts:** Toast notifications for large buy transactions.

---

### Phase 5: Launch & Marketing (Go-to-Market) 🚀
**Focus:** Public release and user acquisition.

- [ ] **Testnet Beta**
  - Deploy to **Story Aeneid Testnet**.
  - Community event: "Launch your Test IP" campaign.

- [ ] **Documentation**
  - Publish Gitbook/Docs explaining the "IP Backed Token" mechanism.
  - Create "How-to" video tutorials for creators.

- [ ] **Mainnet Launch**
  - Deploy final contracts to **Story Mainnet**.
  - Launch Marketing Campaign.

---

## 📚 References

- [Story Protocol Docs](https://docs.story.foundation)
- [Dynamic.xyz Docs](https://www.dynamic.xyz/docs)
- [Goldsky / The Graph Docs](https://docs.goldsky.com)

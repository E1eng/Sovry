# Sovry

Sovry is the first decentralized exchange (AMM) specifically designed for the Story Protocol ecosystem. It enables creators to bootstrap liquidity for their IP Assets instantly and allows investors to trade Royalty Tokens (RT).

Creators lock a portion of their **Story Protocol Royalty Tokens (RT)** into the Launchpad, which deploys a branded ERC‑20 **wrapper token** and sells it on a bonding curve. When the raise target is hit, the wrapper graduates to a **PiperX V2** pool. Royalties earned by the underlying IP can be **harvested** and injected back into the curve to **boost price**.

- **Frontend**: Next.js 16 with TypeScript
- **Backend**: Express.js API server  

## 🏗 Architecture

- **Blockchain**: Story Protocol – Aeneid Testnet (chainId 1315)
- **Core Contracts** (Aeneid):
  - `SovryLaunchpad.sol` – bonding curve engine + graduation to PiperX
  - `SovryToken.sol` – simple ERC‑20 wrapper token (one per IP launch)
- **Frontend**: Next.js + TypeScript (in `frontend/`)
  - `/` – Launch grid (from subgraph)
  - `/create` – Launch flow (Register IP → Get RT → Launch)
  - `/pool/[address]` – Trading terminal (chart + trade + comments + harvest)
- **Wallet**: Dynamic.xyz (primary wallet context + viem integration)
- **Indexing**: The Graph / Goldsky subgraph tracking **Launchpad events only**

---

## ⚙️ Smart Contracts (Aeneid)

> Always check deployed addresses in env / deployment logs; values below are examples.

- **Launchpad** – `SovryLaunchpad`
  - Holds locked RT inventory
  - Mints wrapper tokens
  - Runs bonding curve for buys/sells
  - Calls PiperX V2 router `addLiquidityETH` on graduation
  - Implements Harvest & Pump
- **Wrapper Token** – `SovryToken`
  - `constructor(string name, string symbol, uint256 supply, address owner)`
  - Mints total `supply` to `owner` (Launchpad)
  - `onlyOwner` `mint` and `burnFrom` hooks for Launchpad control

Key on-chain behaviours:

- **Wrapper Pattern**
  - `launchToken(royaltyToken, amount, name, symbol)`
  - Launchpad locks `amount` of RT from creator
  - Deploys a `SovryToken` wrapper and mints `amount` units to itself
  - Emits `WrapperDeployed(royaltyToken, wrapper, name, symbol)` and `Launched(wrapper, creator)`

- **Fractional Listing**
  - `amount` parameter lets creators choose **what % of their RTs** to tokenize
  - Frontend passes `amountToLock = balance * percentage / 100`

- **Bonding Curve**
  - `buy(token)` – pays native IP, takes 0.5% fee to `feeTo`, rest into curve
  - `sell(token, tokenAmount)` – returns IP minus 0.5% fee
  - Curve math uses constant product formula with a **virtual IP reserve**

- **Harvest & Pump**
  - `harvestAndPump(wrapperToken)` – Launchpad (as RT holder) calls Story’s **royalty vault**
    - Checks WIP balance before/after
    - Treats claimed WIP as **free reserve** and adds to `totalRaised`
    - Emits `RevenueInjected(wrapperToken, amount)`

- **Graduation to PiperX**
  - When `totalRaised` ≥ `TARGET_RAISE` (e.g. `100 ether` of IP):
    - `_graduate(token)` calls PiperX router `addLiquidityETH`
    - Supplies all accumulated IP and remaining wrappers
    - Sends LP tokens to `0x...dEaD` (burn) to lock liquidity
    - Emits `Graduated(token, pool, totalLiquidity)`

- **Redemption**
  - `redeem(wrapperToken, amount)` burns wrapper tokens held by user and returns underlying RT 1:1
  - Emits `Redeemed(wrapper, user, amount)`

---

## 🌐 Frontend Apps

### `frontend/` – Next.js App Router

- **Navigation**
  - `Home` – `/`
  - `Create` – `/create`
  - `Profile` – `/profile`

- **Home (`/`) – Launch Grid**
  - Fetches `Launch` entities from the subgraph
  - Shows wrapper token address, creator, and launch date
  - Clicking a card routes to `/pool/[address]` for trading

- **Create (`/create`) – Launch Your IP**
  - Register IP on Story Protocol:
    - Title, Description, Image / Media URL, optional symbol
  - Get Royalty Tokens:
    - Mint license, deploy Story Royalty Vault, transfer RTs to user
  - Configure Launch:
    - Wrapper **name & symbol** (e.g. `Chill Guy`, `CHILL`)
    - **Percentage to Launch** slider (1–100%)
  - Launch on Bonding Curve:
    - Calls `launchOnBondingCurveDynamic(royaltyToken, name, symbol, percentage)`
    - Under the hood: approves Launchpad for `amountToLock` and calls `launchToken`

- **Pool Detail (`/pool/[address]`) – Trading Terminal**
  - Left: Bonding curve chart + IP metadata + license terms + comments
  - Right:
    - Bonding curve progress vs target raise
    - Trade widget (bonding-curve buy/sell)
    - **Harvest Royalties** button:
      - Calls `harvestAndPump(wrapperToken)` via `launchpadService`
      - Tooltip: "Claim pending royalties from Story Protocol to this pool's Launchpad vault and inject them into the bonding curve reserve. This can instantly boost the token price for all holders."

---

## 📊 Subgraph (Launchpad-Only)

Directory: `subgraph/`

- **Data Source**: `SovryLaunchpad` only (no legacy factory/pool indexing)
- **Tracked Events**:
  - `Launched(token, creator)`
  - `WrapperDeployed(royaltyToken, wrapper, name, symbol)`
  - `Bought(token, buyer, amountIP, amountTokens)`
  - `Sold(token, seller, amountTokens, amountIP)`
  - `RevenueInjected(token, amount)`
  - `Graduated(token, pool, totalLiquidity)`
  - `Redeemed(wrapper, user, amount)`

Core entities in `schema.graphql`:

- `Launch` – one per wrapper token
- `Trade` – all buys/sells on the curve
- `RevenueInjection` – Harvest & Pump events
- `Graduation` – final state when a launch moves to PiperX

Use this subgraph to power the **Home grid**, analytics charts, and profile views.

---

## 🔐 Environment Variables

Root / frontend `.env` examples:

```bash
# --- Blockchain ---
PRIVATE_KEY=your_wallet_private_key
NEXT_PUBLIC_STORY_RPC_URL=[https://aeneid.storyrpc.io](https://aeneid.storyrpc.io)

# --- Story Protocol API ---
NEXT_PUBLIC_STORY_API_KEY=your_api_key_here

# --- Dynamic.xyz Wallet ---
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=your_environment_id

# --- Backend API ---
NEXT_PUBLIC_API_URL=http://localhost:3001

# --- Goldsky & Database ---
GOLDSKY_API_URL=[https://api.goldsky.com/](https://api.goldsky.com/)...
DATABASE_URL=postgres://user:pass@localhost:5432/sovry_db


2. Start Development

# Install dependencies
npm install

# Start both Frontend and Backend (concurrently)
npm run dev

# Access the apps:
# Frontend: http://localhost:3000
# Backend: http://localhost:3001

# Dynamic.xyz
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=your_dynamic_environment_id

# Launchpad
NEXT_PUBLIC_LAUNCHPAD_ADDRESS=0x...   # SovryLaunchpad on Aeneid

# Subgraph
NEXT_PUBLIC_SUBGRAPH_URL=https://api.goldsky.com/api/public/.../subgraphs/sovry-launchpad/latest

# Optional backend (if you run one)
NEXT_PUBLIC_API_URL=http://localhost:3001
```

If you also deploy contracts from scripts, you may keep `SOVRY_LAUNCHPAD_ADDRESS` at the root for tooling.

---

## 🚀 Development

From project root:

```bash
npm install:all
npm run dev

# Frontend: http://localhost:3000
```

Subgraph (optional, if you’re iterating on mappings/schema):

## 🗺️ Project Roadmap

Below is the development roadmap for Sovry, focused on pivoting from a standard AMM to a Bonding Curve Launchpad model.

### Phase 1: Foundation & Smart Contracts (The Pivot) 🏗️
**Focus:** Replacing the old DEX infrastructure with the new Bonding Curve Launchpad engine.

- [x] **Architecture Design**
  - Pivot from AMM Model (Factory/Router) to Bonding Curve Model (Launchpad).
  - Set Graduation Target to **PiperX V2** (Major Story Protocol DEX).

- [x] **Smart Contract Development**
  - `SovryToken.sol`: Implement a standard, mintable/burnable ERC-20 Wrapper Contract.
  - `SovryLaunchpad.sol`:
    - **Bonding Curve Logic:** Implement linear price curve with buy/sell functions.
    - **Wrapper Mechanism:** `launchToken` function to accept Royalty Tokens (RT), lock them in the vault, and mint Wrapper Tokens.
    - **Fractional Listing:** Logic to accept a specific amount of RT to lock (allowing 10-100% listing).
    - **Harvest & Pump:** Implement `harvestAndPump()` to claim royalties from Story Protocol and inject them into the curve's liquidity reserve (raising floor price).
    - **Graduation:** Implement `_graduate()` to migrate liquidity to PiperX V2 Router and burn LP tokens.
    - **Fee System:** Implement 0.5% trading fee routed to the Treasury.

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

- [ ] **New "Create" Page (The Launcher)**
  - **Native Story Integration:** Fetch and preview IP Media directly from Story Protocol metadata (No manual upload).
  - **Fractional Slider:** UI to select "Percentage of IP to List" (1% - 100%).
  - **Transaction Flow:** Register IP -> Mint License -> Approve -> Launch.

- [ ] **New "Token Detail" Page (The Terminal)**
  - **Left Column:** Real-time TradingView Chart (Lightweight Charts) + IP Metadata/License Terms.
  - **Right Column:** Buy/Sell Interface (Bonding Curve) + Slippage Settings.
  - **Bottom Section:** Tabs for "Holder Distribution", "Transaction History", and "Comments".

---

### Phase 3: Data & Social Layer (Backend) 🗄️
**Focus:** Ensuring data speed and community engagement.

- [x] **Indexer (Goldsky Subgraph)**
  - Update `subgraph.yaml` to index `SovryLaunchpad` events (Launched, Bought, Sold, Graduated).
  - Define new Schema Entities: `Launch`, `Trade`, `Candle` (for charting).
  - Deploy new Subgraph to **Goldsky**.

- [ ] **Social Features (Supabase)**
  - Setup Supabase Database tables (`profiles`, `comments`).
  - Implement Real-time Comment Section on Token Detail pages.
  - Implement User Profiles (Avatar, Bio, Social Links like Twitter/Telegram).

- [ ] **Real-time Data (Wagmi)**
  - Implement direct RPC Event Listeners in the frontend for instant price/chart updates (bypassing indexer delay).

---

### Phase 4: Security & Polish 🛡️
**Focus:** Security, investor trust, and platform stability.

- [ ] **Security Hardening**
  - Implement **SIWE (Sign-In with Ethereum)** for Supabase authentication to prevent identity spoofing.
  - Add Slippage Protection & Max Transaction Limits in the UI.
  - Implement Rate Limiting for Social APIs.

- [ ] **IP Asset Integrity**
  - Ensure all displayed metadata is fetched strictly from On-Chain/IPFS (Single Source of Truth).

- [ ] **Gamification**
  - **"King of the Hill":** Highlight the top token nearing graduation on the Home Page.
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

## 🛠️ Tech Stack

- **Blockchain:** Story Protocol, Solidity
- **Frontend:** Next.js, TailwindCSS, Wagmi/Viem
- **Data:** Goldsky (Subgraph), Supabase (Social), Piwata (IPFS)
- **Charting:** TradingView Lightweight Charts

- **Home**: Trending IP assets with NFT-style display
- **Portfolio**: Track IP asset holdings and royalties
- **Pool Analysis**: Detailed IP asset metadata and license terms
- **Liquidty**: Unlock Royalty Token and Add liquidity to your IP assets
- **Trading**: Swap interface for IP asset tokens
- **Revenue**: Royalty claiming and tracking

## 📚 Documentation

- [Story Protocol Docs](https://docs.story.foundation)
- [Dynamic.xyz Docs](https://www.dynamic.xyz/docs)
- [Goldsky Docs](https://docs.goldsky.com)

# SovryLaunchpad Integration Guide

_Last updated: after Aeneid env tests & final/comprehensive suites were green_

This document explains how to integrate the **SovryLaunchpad** system from frontend, backend, and subgraph/indexer perspectives.

It is based on the current deployed contracts and tests in this repo (Hardhat + Aeneid / Story Aeneid testnet).

---

## 1. High-Level Architecture

### 1.1 Core Components

- **SovryLaunchpad.sol**
  - Main entrypoint for launching wrapper tokens, trading on a linear bonding curve, harvesting royalties, and graduating to DEX (PiperX router).
- **SovryToken.sol**
  - ERC20 (6 decimals) wrapper token contract, one instance per launch.
  - Mintable/burnable by the launchpad; may wrap an underlying RT.
- **Royalty Tokens (RT)**
  - External ERC20 6-decimal tokens (Story Protocol royalty tokens or mocks in local tests).
- **PiperX Router (IPiperXRouter)**
  - DEX router used for liquidity migration at graduation and post‑graduation buyback & burn.
- **Royalty Workflows (IRoyaltyWorkflows)**
  - Story Protocol royalty contract used by `harvest` to claim and inject royalties into the bonding curve.

### 1.2 Key Concepts

- **RT (Royalty Token)**: 6-decimal ERC20 that represents original IP revenue rights.
- **Wrapper (SovryToken)**: 6-decimal ERC20 created per launch that represents fractionalized exposure to RT and bonding curve.
- **Bonding Curve**: Linear price function over wrapper supply:
  - `price = basePrice + soldUnits * priceIncrement`.
  - Purchases decrease `currentSupply` and increase `reserveBalance`.
  - Sells increase `currentSupply` and decrease `reserveBalance`.
  - Market cap used for graduation threshold.
- **Graduation**: Once the token’s bonding curve market cap stays above `graduationThreshold` for `GRADUATION_DELAY`, liquidity is migrated to DEX and bonding curve is disabled.

---

## 2. Addresses and Networks

### 2.1 Story Aeneid Testnet (current env)

From `.env` and deploy scripts (example values, adjust to your actual `.env`):

```ini
# Launchpad & environment
LAUNCHPAD_ADDRESS_AENEID="0x101fff014606aADb390289583b741F72DD097041"
WIP_ADDRESS_AENEID="0x1514000000000000000000000000000000000000"   # WIP token (wrapped IP / native)
PIPERX_ROUTER_AENEID="0x674eFAa8C50cBEF923ECe625d3c276B7Bb1c16fB"
ROYALTY_WORKFLOWS_AENEID="0x9515faE61E0c0447C6AC6dEe5628A2097aFE1890"

# Example RT for Aeneid env tests
RT_ADDRESS_AENEID="0x1418988b72dA8B1f2CE3158a4116b5ea8f3390aB"   # TestRT100 (6 decimals, 100 RT total)
WRAPPER_ADDRESS_AENEID="0x451d03aA524F8A07De03895d98579F3e015b997b" # Wrapper launched in Stage1 (optional cache)
```

### 2.2 Hardhat Local

- Uses mocks deployed per test fixture.
- No `.env` is needed for local tests; addresses are ephemeral.
- Frontend / integration should treat Hardhat as dev-only.

---

## 3. Tokenomics and Units

### 3.1 Constants

From `SovryLaunchpad.sol`:

- `RT_DECIMALS = 6`
- `RT_UNIT = 10 ** 6` (1 RT in raw units)
- `WRAPPER_DECIMALS = 6`
- `WRAP_UNIT = 10 ** 6`
- `WRAP_PER_RT = 1_000_000`
- `MIN_LISTING_AMOUNT = 10 * RT_UNIT` (10 RT minimum lock for launch/prefund)
- Fee parameters:
  - `TOTAL_FEE_BPS = 100` (1% of trade volume)
  - `CREATOR_FEE_BPS = 50` (50% of fee → 0.5% to creator)
  - `PROTOCOL_FEE_BPS = 50` (50% of fee → 0.5% to treasury)
- Split at launch:
  - 5% RT premine to creator.
  - 20% RT reserved for DEX liquidity at graduation.
  - 75% RT equivalent supply assigned to bonding curve.
- Graduation:
  - `graduationThreshold` (configurable at deploy; currently `0.8 ETH` on Aeneid env).
  - `GRADUATION_DELAY = 15 minutes`.

### 3.2 Price Parameters (Aeneid env config)

In `SovryLaunchpad.env.stage1.test.ts`, current testnet defaults:

```ts
const basePrice     = ethers.utils.parseEther("0.00000001");       // 1e-8
const priceIncrement = ethers.utils.parseEther("0.00000000000001"); // 1e-14
```

At launch with 50 RT locked:

- `totalLocked = 50 RT` → `totalSupplyUnits = 50 * 1_000_000 = 50_000_000`.
- Initial price: `≈ basePrice = 1e-8`.
- Initial market cap: `≈ 0.5 ETH`.

Frontend should not hardcode these numbers; instead, fetch from `getTokenInfo` and `getBondingCurve`, or derive via `getCurrentPrice`/`getMarketCap`.

---

## 4. Core Storage and Views

### 4.1 Main Structs

```solidity
struct BondingCurve {
    uint256 basePrice;
    uint256 priceIncrement;
    uint256 currentSupply;    // wrapper smallest units
    uint256 reserveBalance;   // native token (WIP/ETH) in wei
    bool isActive;
}

struct LaunchedToken {
    address rtAddress;
    address wrapperAddress;
    address creator;
    uint256 launchTime;
    uint256 totalLocked;          // RT smallest units
    bool graduated;
    uint256 totalRoyaltiesHarvested;
    address vaultAddress;         // launchpad address (this)
    uint256 dexReserve;           // RT smallest units reserved for DEX
    uint256 initialCurveSupply;   // wrapper smallest units assigned to curve
}
```

### 4.2 Key Mappings

- `mapping(address => BondingCurve) public bondingCurves;`
- `mapping(address => LaunchedToken) public launchedTokens;`
- `mapping(address => address) public rtToWrapper;`
- `mapping(address => address) public wrapperToRt;`
- `address[] public allLaunchedTokens;`
- `mapping(address => bool) public approvedRTs;`
- `address[] public approvedRTsList;`

### 4.3 Important View Functions

- `function getTokenInfo(address wrapper) external view returns (LaunchedToken memory)`
- `function getBondingCurve(address wrapper) external view returns (BondingCurve memory)`
- `function getAllLaunchedTokens() external view returns (address[] memory)`
- `function getApprovedRTs() external view returns (address[] memory)`
- `function isRTApproved(address rt) external view returns (bool)`
- `function getCurrentPrice(address wrapper) external view returns (uint256)`
- `function getMarketCap(address wrapper) external view returns (uint256)`
- `function getDepositBalance(address user, address rt) external view returns (uint256)`

These are the primary calls for frontend/subgraph to build:

- Explore page: list of launched tokens.
- Token detail page: price, market cap, reserves, grad status.
- User pages: deposits, holdings (plus ERC20 `balanceOf` from wrapper contract).

---

## 5. Launching Tokens

### 5.1 RT Whitelisting (Owner-only)

```solidity
function addApprovedRT(address rtToken) external onlyOwner;
```

- Must be called before any `launchToken` or `depositRT/launchTokenPrefunded`.
- Frontend: typically only an admin UI or script.

### 5.2 Normal Launch (Non-prefunded)

```solidity
function launchToken(
    address rtAddress,
    uint256 amount,        // RT smallest units (>= MIN_LISTING_AMOUNT)
    string calldata name,
    string calldata symbol,
    uint256 basePrice,
    uint256 priceIncrement
) external;
```

Frontend flow:

1. **Preconditions**:
   - `rtToWrapper[rtAddress] == 0` → token not launched yet.
   - `approvedRTs[rtAddress] == true`.
   - `amount >= MIN_LISTING_AMOUNT` (10 RT, in 6-decimals).
   - Creator has at least `amount` RT.
2. **Approve** RT to launchpad:
   - `rt.approve(launchpad, amount)`.
3. **Call** `launchToken`.
4. **Listen** for `TokenLaunched(rt, wrapper, creator, amount, launchTime)`.

### 5.3 Prefunded Launch (Using depositRT)

```solidity
function depositRT(address rtToken, uint256 amount) external;
function launchTokenPrefunded(
    address rtAddress,
    uint256 amount,
    string calldata name,
    string calldata symbol,
    uint256 basePrice,
    uint256 priceIncrement
) external;
```

- `depositRT` transfers RT from caller into `userDeposits[user][rt]`.
- `launchTokenPrefunded`:
  - Requires `userDeposits[msg.sender][rt] >= amount`.
  - Enforces same `MIN_LISTING_AMOUNT`.
  - Uses same internal `_launchCore` and mint logic as `launchToken`.
- Security property: **only depositor** can use their deposits; no front‑run/race theft.

Frontend/backends can show:

- User’s `getDepositBalance(user, rt)` and allow a “Launch from deposit” flow.

---

## 6. Trading on Bonding Curve

### 6.1 Price Helpers

```solidity
function calculateBuyPrice(address wrapper, uint256 amount) public view returns (uint256);
function calculateSellPrice(address wrapper, uint256 amount) public view returns (uint256);
```

- `amount` must be a multiple of `WRAP_UNIT`.
- Returns **base cost excluding 1% fee**.
- Frontend should:
  - Use these to preview cost/proceeds.
  - Add/subtract fee: `fee = base * 1%`.

### 6.2 Buy

```solidity
function buy(
    address wrapperToken,
    uint256 amount,        // wrapper units (multiple of WRAP_UNIT)
    uint256 maxEthCost,    // slippage cap, must include fee
    uint256 deadline       // block.timestamp <= deadline
) external payable;
```

Flow for frontend:

1. User inputs `amountInWrap` (e.g. 1.0 wrapper → `1 * WRAP_UNIT`).
2. Fetch `base = calculateBuyPrice(wrapper, amount)`.
3. Compute `fee = base * TOTAL_FEE_BPS / BPS_DENOMINATOR` (1%).
4. Compute `totalCost = base + fee`.
5. Choose `maxEthCost >= totalCost` (e.g. `totalCost * 1.01` as tolerance).
6. Call `buy` with:
   - `value = totalCost`.
   - `maxEthCost` as above.

Errors to handle:

- `InsufficientSupply`: not enough inventory in curve.
- `SlippageExceeded`: `totalCost > maxEthCost`.
- `InvalidAmount`, `CurveInactive`, `TokenGraduated`.

### 6.3 Sell

```solidity
function sell(
    address wrapperToken,
    uint256 amount,        // wrapper units (multiple of WRAP_UNIT)
    uint256 minEthProceeds,
    uint256 deadline
) external;
```

Flow:

1. User inputs `amountInWrap` to sell.
2. Fetch `base = calculateSellPrice(wrapper, amount)`.
3. Compute `fee = base * 1%`, `net = base - fee`.
4. Decide slippage floor: `minEthProceeds <= net` (e.g. `net * 0.99`).
5. `wrapper.approve(launchpad, amount)`.
6. Call `sell(wrapper, amount, minProceeds, deadline)`.

Errors to handle:

- `InsufficientSupply`: trying to sell more than ever bought (across all users).
- `InsufficientReserves`: launchpad’s ETH balance < base proceeds.
- `SlippageExceeded`: `netProceeds < minEthProceeds`.
- `TokenGraduated` / `CurveInactive` after graduation.

Note: On Aeneid, due to testnet peculiarities, balance readings can lag; the logic itself is strongly checked in Hardhat tests.

---

## 7. Harvest & Royalties

### 7.1 Harvest

```solidity
function harvest(
    address wrapperToken,
    address ancestorIpId,
    address[] calldata childIpIds,
    address[] calldata royaltyPolicies,
    address[] calldata currencyTokens
) external;
```

- Authorised callers:
  - `creator`, or `tokenHarvesters[wrapper]`, or `owner()`,
  - or **anyone** after `HARVEST_TIMEOUT` (7 days) to prevent griefing.
- Internally:
  - Calls `IRoyaltyWorkflows.claimAllRevenue(...)` to pull WIP/ETH.
  - Computes `claimedAmount = balanceAfter - balanceBefore`.
  - If `claimedAmount < 0.001 ETH` → revert `RoyaltyTooSmall`.
  - If curve `!graduated && isActive` → inject as bonding curve buyback & burn.
  - Else → route to `_buybackAndBurn` on DEX.

Frontend/backends/subgraphs:

- Show `LaunchedToken.totalRoyaltiesHarvested`.
- Track `RoyaltiesHarvested`, `BuybackAndBurn`, `ReservesIncreased` events.
- On UI, when user presses “Harvest” for a token:
  - Build correct arrays of IPs, policies, and currencies.

---

## 8. Graduation

Graduation is fully handled on-chain with auto-balance.

### 8.1 Threshold Logic

```solidity
function _checkGraduation(address wrapper) internal {
    LaunchedToken storage token = launchedTokens[wrapper];
    BondingCurve storage curve = bondingCurves[wrapper];

    if (token.graduated || !curve.isActive) return;

    uint256 marketCap = getMarketCap(wrapper);
    if (marketCap >= graduationThreshold) {
        if (block.timestamp >= token.launchTime + GRADUATION_DELAY) {
            _graduate(wrapper);
        }
    }
}
```

Triggered by:

- `buy`.
- `_applyRoyaltiesToBondingCurve` / `harvest`.

### 8.2 Effects of Graduation (`_graduate`)

- Marks `token.graduated = true`, `curve.isActive = false`.
- Gathers liquidity:
  - ETH: from `reserveBalance`.
  - Wrapper: from `dexReserve` (RT reserved) converted to wrapper units + remaining `currentSupply`.
- Calculates a **spot price** at graduation and auto-balances to avoid a 50% price crash.
- Uses `PiperXRouter.addLiquidityETH` to create pool and send LP tokens to burn.
- Emits `Graduated(wrapper, liquidity, poolAddress)`.

Frontend/subgraph:

- Watch `Graduated` event.
- When `graduated == true`:
  - Disable curve trading UI.
  - Switch to DEX-based chart/controls (pool address from event).

---

## 9. Security & Admin

### 9.1 Emergency Withdraw

```solidity
function emergencyWithdraw(
    address token,
    address to,
    uint256 amount
) external onlyOwner;
```

- Cannot withdraw:
  - Wrapper inventory: reverts with `"Cannot withdraw wrapper tokens"`.
  - RT vault tokens: reverts with `"Cannot withdraw RT vault tokens"`.
- Only non-core tokens / stray balances can be recovered.

### 9.2 Admin Controls

- `setGraduationThreshold(uint256)` – adjust global threshold.
- `setPiperXRouter(address)` – update router.
- `setTreasury(address)` – update treasury.
- `setHarvester(wrapper, harvester)` – set an authorized harvester.
- Pausable:
  - Contract inherits `Pausable`; owner can pause/unpause trading and key flows.

Front/backends should:

- Treat these as admin-only flows, surface them in an admin dashboard if needed.

---

## 10. Events for Subgraph / Indexers

Key events to index:

- `event TokenLaunched(address indexed rt, address indexed wrapper, address indexed creator, uint256 amount, uint256 launchTime);`
- `event TokensPurchased(address indexed buyer, address indexed wrapperToken, uint256 amount, uint256 cost);`
- `event TokensSold(address indexed seller, address indexed wrapperToken, uint256 amount, uint256 proceeds);`
- `event RoyaltiesHarvested(address indexed wrapperToken, uint256 amount);`
- `event BuybackAndBurn(address indexed wrapperToken, uint256 wipSpent, uint256 wrapperBurned);`
- `event ReservesIncreased(address indexed wrapperToken, uint256 newReserveAmount);`
- `event Graduated(address indexed wrapperToken, uint256 liquidity, address indexed poolAddress);`
- `event FeesCollected(address indexed wrapperToken, uint256 amount);`
- `event CreatorFeePaid(address indexed wrapperToken, address indexed creator, uint256 amount);`
- `event RTDeposited(address indexed user, address indexed rtToken, uint256 amount);`
- `event RTWithdrawn(address indexed user, address indexed rtToken, uint256 amount);`
- `event RTApproved(address indexed rtToken);`
- `event RTRemoved(address indexed rtToken);`

Subgraph suggestions:

- **Entities**:
  - `Launchpad`, `TokenLaunch`, `WrapperToken`, `User`, `Trade`, `Harvest`, `GraduationEvent`, `Deposit`.
- **Derived fields**:
  - Current price (`getCurrentPrice`) and market cap (`getMarketCap`) via call handlers, or approximated from curve data.
  - Trading volume, fees to treasury/creator.

---

## 11. Integration Recipes

### 11.1 Frontend – Launch Flow

1. User selects RT (from allowlisted RTs).
2. Frontend fetches:
   - `MIN_LISTING_AMOUNT`, `RT_UNIT`, `WRAP_UNIT`, `WRAP_PER_RT`.
3. User inputs amount (>= 10 RT).
4. Approve RT to launchpad.
5. Call `launchToken` (normal) or `depositRT` + `launchTokenPrefunded`.
6. Wait for `TokenLaunched` event.
7. Redirect to token page `/pool/[wrapper]` using wrapper from event.

### 11.2 Frontend – Trading UI

For a given `wrapper`:

- On load:
  - Fetch `LaunchedToken` and `BondingCurve`.
  - Fetch `getCurrentPrice`, `getMarketCap`.
- When user changes buy amount:
  - Compute `amountRaw = userAmount * WRAP_UNIT`.
  - Call `calculateBuyPrice(wrapper, amountRaw)`.
  - Show base price, fee, total.
- When user confirms:
  - Call `buy` with `value = totalCost` and `maxEthCost = totalCost * (1 + slippageTolerance)`.

Similar flow for `sell` with `calculateSellPrice` and `minProceeds`.

### 11.3 Backend / Services

Backend services can:

- Periodically snapshot:
  - `getAllLaunchedTokens`.
  - For each wrapper: `getTokenInfo`, `getBondingCurve`, `getCurrentPrice`, `getMarketCap`.
- Monitor `Graduated` & `RoyaltiesHarvested` events to trigger notifications.
- Offer off-chain quoting endpoints using `calculateBuyPrice` / `calculateSellPrice`.

---

## 12. Testing Strategy (for Integrators)

You can mirror the repo’s strategy:

- **Local/Hardhat**:
  - Run `npx hardhat test` to validate all invariants.
  - Use mocks for routing/royalties.
- **Aeneid Env Tests**:
  - `SovryLaunchpad.env.stage1.test.ts`: Launch + basic buy.
  - `SovryLaunchpad.env.stage2.test.ts`: Math consistency + trading paths.

These tests are a good reference on how to:

- Attach to deployed contracts using `.env`.
- Handle RT whitelisting, launch, buy/sell calls.
- Deal with real network constraints (delayed state, ETH reserves, etc.).

---

## 13. Notes & Gotchas

- **Minimum listing** is a hard requirement: 10 RT (6-decimals). Frontend must enforce this.
- **Units**: always convert human-readable RT/WRAP/IP amounts to raw units using `RT_UNIT` and `WRAP_UNIT`.
- On testnets (like Aeneid), `balanceOf` reads may lag behind transactions; rely on:
  - Event logs,
  - Curve state (`currentSupply`, `reserveBalance`),
  - And `getCurrentPrice`/`getMarketCap` for critical logic.
- After graduation, `buy`/`sell` on the bonding curve will revert with `CurveInactive`/`TokenGraduated`; UI must switch to DEX mode.

This document should give frontend, backend, and subgraph teams everything they need to integrate with SovryLaunchpad on both local and Aeneid environments.


# Sovry Contracts Flow (Updated for PiperX V3, 50/50 fees)

This document describes how Sovry Launchpad works on Story Protocol (Aeneid) after the V3 upgrade. It covers Factory → Exchange → Router interactions, bonding curve trading, WIP-based royalties, graduation to PiperX **V3** with LP NFT custody, and the 50/50 treasury/IP fee split across all fees.

## High-level flow

1) **Launch** via `SovryFactory.launchToken`
   - Collects a fixed launch fee (1 ETH) and forwards to treasury via `queueLaunchFee`
   - Calls `SovryExchange.launchTokenFromFactory`
   - Deploys a new `SovryToken` wrapper (18 decimals) around 100 locked RT; wrapper transfers are locked until graduation

2) **Trade** on the bonding curve via `SovryRouter.buyETH` / `SovryRouter.sell`
   - Linear price: `basePrice + n * priceIncrement`
   - **Trade fee = 1%** of base cost, split **50% treasury / 50% IP Asset** (emitted per trade)

3) **Harvest royalties (WIP) and DEX fees (V3 LP)**
   - Royalties are ERC20/WIP (Story whitelisted); trade fees are native IP/ETH
   - Keeper calls (requires `KEEPER_ROLE`):
     - `distributeRoyalties(wrapper, wipAmount, amountOutMin)` → splits WIP **50% treasury / 50% IP Asset**
     - `harvestDexFees(wrapper, 0)` → collects PiperX V3 LP fees and splits **50% treasury / 50% IP Asset** in the collected token(s)

4) **Graduation to PiperX V3** (when threshold reached)
   - Exchange mints V3 liquidity via PositionManager; receives LP NFT (tokenId) and stores it (`lpTokenIds(wrapper)`) while keeping custody
   - Skims **10%** of native reserve pre-LP; split **50% treasury / 50% IP Asset**
   - Marks wrapper graduated, unlocks transfers, renounces wrapper ownership, and emits `Graduated(wrapper, liquidity, poolAddress)`
   - **Fallback:** if LP mint fails, intended liquidity is sent to treasury and `Graduated` emits with `poolAddress = 0`

5) **Redeem** (wrapper → RT) remains available post-graduation

## Contracts and roles

- **SovryFactory**: collects launch fee; only admin can set fee
- **SovryExchange**: holds RT reserves, manages curve, graduation, PiperX V3 LP mint + custody (LP NFT), royalties/DEX fee split 50/50 treasury/IP Asset
- **SovryRouter**: user-friendly gateway for launch / buy / sell / price view
- **SovryToken**: soulbound until graduation; 18 decimals wrapper around locked RT
- **Keeper**: `KEEPER_ROLE` allowed to harvest royalties (WIP) and collect DEX fees from V3 LP

## Events tracked by the subgraph

- `TokenLaunched`
- `TokensPurchased`
- `TokensSold`
- `TokensRedeemed`
- `RoyaltiesHarvested`
- `Graduated` (pool + LP tokenId queryable via `lpTokenIds(wrapper)`)
- `GraduationThresholdUpdated`

## Fee flows (updated)

- **Trade fee (1%)**: 50% treasury / 50% IP Asset (native IP/ETH)
- **Royalties (WIP/ERC20)**: keeper deposits WIP and splits 50/50 treasury/IP Asset (no buyback/burn)
- **DEX fees (V3 LP)**: keeper collects and splits 50/50 treasury/IP Asset in whatever token PiperX returns (wrapper/WIP ordering handled internally)
- **Graduation skim (10% native)**: 50/50 treasury/IP Asset

## Graduation path (V3)

- Uses PiperX V3 PositionManager to mint LP and receive an LP NFT (custodied by Exchange)
- If mint fails, liquidity goes to treasury; wrapper still marked graduated (fallback path)

## Redemption

- `redeem(wrapper, wrapperAmount, recipient)` burns wrapper and returns pro-rata RT

## Known differences vs old spec

- Trade fee is 1% (not 0.2%) and split 50/50 treasury/IP Asset
- Royalties are WIP/ERC20-only (per Story whitelisted tokens), no native buyback/burn
- Graduation uses PiperX V3 with LP NFT custody (not V2 burn-to-zero)

## 1. High-Level Architecture
```mermaid
graph LR;
    U["User / Creator / Trader"] --> R["SovryRouter"];
    R --> F["SovryFactory"];
    R --> X["SovryExchange"];
    Keeper["Keeper Bot"] --> X;
    X --> W["SovryToken Wrapper"];
    X --> RT["Underlying RT Token"];
    X --> PX["PiperX V3 Router"];
    PX --> Pair["PiperX V3 LP NFT"];
    X --> T["Treasury"];
    X --> Creator["Creator Address"];
```

## 2. Launch Flow
```mermaid
graph TD;
    C["Creator"] --> A1["Approve RT to Exchange"];
    A1 --> RL["SovryRouter.launchToken (pays launch fee)"];
    RL --> FL["SovryFactory.launchToken"];
    FL --> A2["Call Exchange.queueLaunchFee(treasury)"];
    A2 --> TREAS["Fee becomes withdrawable via pendingWithdrawals"];
    FL --> A3["Call SovryExchange.launchTokenFromFactory"];
    A3 --> XLF["SovryExchange.launchTokenFromFactory"];
    XLF --> XRT["Exchange receives RT (transferFrom creator)"];
    XLF --> WNEW["Deploy SovryToken wrapper"];
    XLF --> WMINT["Wrapper mints fixed supply (18 decimals) to Exchange"];
    XLF --> CURVE["Store BondingCurve + LaunchedToken state"];
    CURVE --> DONE["Token launched"];
```

## 3. Buy Flow (Trader purchases wrapper with ETH)
```mermaid
graph TD;
    T["Trader"] --> A_BUY["Call Router.buyETH with msg.value"];
    A_BUY --> RB["SovryRouter.buyETH"];
    RB --> XB["SovryExchange.buy"];
    XB --> CHK["Validate deadline & reserves"];
    CHK --> COST["BondingCurveLib.calculateBuyPrice"];
    COST --> FEE["Ceil fee = baseCost * TRADE_FEE_BPS / 10000"];
    XB --> STATE["Update curve supply & reserveBalance"];
    STATE --> SEND["Transfer wrapper tokens to recipient"];
    XB --> ENQ["Queue fee via pendingWithdrawals"];
    ENQ --> EV["emit TokensPurchased"];
```

## 4. Sell Flow (Trader sells wrapper for ETH)
```mermaid
graph TD;
    T["Trader"] --> A_SELL["Call Router.sell"];
    A_SELL --> RS["SovryRouter.sell"];
    RS --> XS["SovryExchange.sell"];
    XS --> CHK["Validate deadline & holdings"];
    CHK --> PRO["BondingCurveLib.calculateSellPrice"];
    PRO --> FEE["Ceil fee = baseProceeds * TRADE_FEE_BPS / 10000"];
    XS --> STATE["Update curve supply & reserveBalance"];
    STATE --> PAYS["_safeTransferETH to seller (net)"];
    XS --> ENQ["Queue creator fee via pendingWithdrawals"];
    ENQ --> EV["emit TokensSold"];
```

## 5. Royalty Deposit Flow (Keeper-driven per wrapper)
```mermaid
graph TD;
    K["Keeper"] --> A_ROYALTY["Call depositRoyalties(wrapper, wipAmount)"];
    A_ROYALTY --> XDR["SovryExchange.depositRoyalties"];
    XDR --> WIPIN["Transfer WIP from keeper"];
    WIPIN --> UNWRAP["IWIP.withdraw to native ETH"];
    UNWRAP --> CLAIM["claimedAmount computed"];
    CLAIM --> DECIDE_ACTIVE{"Curve active and not graduated?"};
    DECIDE_ACTIVE -->|Yes| PATH1["_applyRoyaltiesToBondingCurve"];
    PATH1 --> RES["Increase reserveBalance"];
    RES --> CHK["_checkGraduation"];
    CHK --> GRAD["Graduate if threshold met"];
    DECIDE_ACTIVE -->|No| PATH2["_buybackAndBurn"];
    XDR --> EV["emit RoyaltiesHarvested"];
```

## 6. Graduation Flow (PiperX V2 addLiquidity + burn LP)
```mermaid
graph TD;
    GRAD["_graduate(wrapper)"] --> FLAG["Mark token graduated + disable curve"];
    FLAG --> NAT["nativeLiquidity = reserveBalance"];
    NAT --> FEES["feeTotal = 10% split creator / treasury"];
    FEES --> PAY["_safeTransferETH push-or-pull"];
    PAY --> APPR["Approve PiperX router for tokenLiquidity"];
    APPR --> ADD["router.addLiquidityETH ... to 0x000...dEaD"];
    ADD --> LP["LP tokens minted to 0xdead"];
    ADD --> EVT["emit Graduated(wrapper, liquidity, pair)"];
    ADD --> DUST["Dust tokens & ETH split creator / treasury"];
    DUST --> REN["SovryToken(wrapper) renounces ownership"];
    ADD --> FAIL{"addLiquidityETH reverts?"};
    FAIL -->|Yes| FB["Fallback: send wrapper + ETH to treasury"];
    FB --> EVT2["emit Graduated(wrapper, 0, address(0))"];
    EVT2 --> REN2["SovryToken(wrapper) renounces ownership"];
```

## 7. Pending Withdrawal Flow (pull-based ETH claims)
```mermaid
graph TD;
    B["Beneficiary"] --> WP["Call withdrawPending(to)"];
    WP --> READ["Load pendingWithdrawals[msg.sender]"];
    READ --> DECIDE_PENDING{"Amount > 0?"};
    DECIDE_PENDING -->|No| REVERT["Revert InvalidAmount"];
    DECIDE_PENDING -->|Yes| ZERO["Set pending to 0"];
    ZERO --> CALL["Attempt to send ETH to 'to'"];
    CALL --> DECIDE_CALL{"Call succeeded?"};
    DECIDE_CALL -->|No| RESTORE["Restore pending & revert TransferFailed"];
    DECIDE_CALL -->|Yes| DONE["ETH received"];
```

## 8. Redeem Flow (Burn wrapper for pro-rata RT)
```mermaid
graph TD;
    U["Wrapper holder"] --> R1["Approve wrapper to Exchange"];
    R1 --> R2["Call Exchange.redeem(wrapper, amount, recipient)"];
    R2 --> S1["Compute rtAmount = amount * totalLocked / totalSupply"];
    S1 --> B1["Transfer wrapper to Exchange"];
    B1 --> B2["Burn wrapperAmount"];
    B2 --> T1["Decrease totalLocked"];
    T1 --> T2["Transfer rtAmount to recipient"];
    T2 --> EV["emit TokensRedeemed"];
```

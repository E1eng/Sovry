# Sovry Contracts Flow Diagrams

This document captures the current Factory ⇄ Exchange ⇄ Router architecture, including royalty handling, graduation, and pending withdrawal flows. All diagrams use Mermaid syntax and follow the latest on-chain behavior.

## 1. High-Level Architecture
```mermaid
graph LR;
    U["User / Creator / Trader"] --> R["SovryRouter"];
    R --> F["SovryFactory"];
    R --> X["SovryExchange"];
    Keeper["Keeper Bot"] --> X;
    X --> W["SovryToken Wrapper"];
    X --> RT["Underlying RT Token"];
    X --> PX["PiperX V2 Router"];
    PX --> Pair["Uniswap V2 Pair - Wrapper/WETH"];
    X --> T["Treasury"];
    X --> Creator["Creator Address"];
```

## 2. Launch Flow
```mermaid
graph TD;
    C["Creator"] --> A1["Approve RT to Exchange"];
    A1 --> RL["SovryRouter.launchToken (pays launch fee)"];
    RL --> FL["SovryFactory.launchToken"];
    FL --> A2["Forward launch fee ETH to treasury"];
    A2 --> TREAS["Treasury receives fee"];
    FL --> A3["Call SovryExchange.launchTokenFromFactory"];
    A3 --> XLF["SovryExchange.launchTokenFromFactory"];
    XLF --> XRT["Exchange receives RT (transferFrom creator)"];
    XLF --> WNEW["Deploy SovryToken wrapper"];
    XLF --> WMINT["Wrapper mints total supply to Exchange"];
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

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
    C["Creator"] -->|Approve RT to Exchange| RTAPP["RT approve exchange amount"];
    C -->|Router.launchToken (launch fee)| RL["SovryRouter.launchToken"];
    RL --> FL["SovryFactory.launchToken"];
    FL -->|Forward launch fee ETH| TREAS["Treasury receives fee"];
    FL -->|Invoke| XLF["SovryExchange.launchTokenFromFactory"];
    XLF -->|transferFrom creator| XRT["Exchange receives RT"];
    XLF -->|Deploy wrapper| WNEW["New SovryToken wrapper"];
    XLF -->|Mint totalWrapped to Exchange| WMINT["Wrapper mints to Exchange"];
    XLF -->|Init bonding curve| CURVE["BondingCurve + LaunchedToken stored"];
    CURVE --> DONE["Token launched"];
```

## 3. Buy Flow (Trader purchases wrapper with ETH)
```mermaid
graph TD;
    T["Trader"] -->|Router.buyETH (msg.value)| RB["SovryRouter.buyETH"];
    RB --> XB["SovryExchange.buy"];
    XB -->|Validate deadline & reserves| CHK["Parameter checks"];
    CHK --> COST["BondingCurveLib.calculateBuyPrice"];
    COST --> FEE["Fee = ceil(baseCost * TRADE_FEE_BPS / 10000)"];
    XB --> STATE["Update curve supply & reserveBalance"];
    STATE --> SEND["Transfer wrapper tokens to recipient"];
    XB --> PAYC["_safeTransferETH to creator"];
    PAYC -->|If ETH send fails| PEND["pendingWithdrawals[creator] += fee"];
    XB --> EV["emit TokensPurchased"];
```

## 4. Sell Flow (Trader sells wrapper for ETH)
```mermaid
graph TD;
    T["Trader"] -->|Router.sell| RS["SovryRouter.sell"];
    RS --> XS["SovryExchange.sell"];
    XS --> CHK["Validate deadline & holdings"];
    CHK --> PRO["BondingCurveLib.calculateSellPrice"];
    PRO --> FEE["Fee = ceil(baseProceeds * TRADE_FEE_BPS / 10000)"];
    XS --> STATE["Update curve supply & reserveBalance"];
    STATE --> PAYS["_safeTransferETH to seller (net)"];
    XS --> PAYC["_safeTransferETH to creator (fee)"];
    PAYC -->|If ETH send fails| PEND["pendingWithdrawals[creator] += fee"];
    XS --> EV["emit TokensSold"];
```

## 5. Royalty Deposit Flow (Keeper-driven per wrapper)
```mermaid
graph TD;
    K["Keeper"] -->|depositRoyalties(wrapper, wipAmount)| XDR["SovryExchange.depositRoyalties"];
    XDR --> WIPIN["Transfer WIP from keeper"];
    WIPIN --> UNWRAP["IWIP.withdraw -> native ETH"];
    UNWRAP --> CLAIM["claimedAmount computed"];
    CLAIM -->|Curve active & not graduated| PATH1["_applyRoyaltiesToBondingCurve"];
    CLAIM -->|Else| PATH2["_buybackAndBurn"];
    PATH1 --> RES["Increase reserveBalance"];
    RES --> CHK["_checkGraduation"];
    CHK -->|MarketCap >= threshold| GRAD["_graduate"];
    XDR --> EV["emit RoyaltiesHarvested"];
```

## 6. Graduation Flow (PiperX V2 addLiquidity + burn LP)
```mermaid
graph TD;
    GRAD["_graduate(wrapper)"] --> FLAG["token.graduated = true; curve inactive"];
    FLAG --> NAT["nativeLiquidity = reserveBalance"];
    NAT --> FEES["feeTotal = 10% split creator / treasury"];
    FEES --> PAY["_safeTransferETH push-or-pull"];
    PAY --> APPR["ERC20 approve PiperX router for tokenLiquidity"];
    APPR --> ADD["router.addLiquidityETH{value:nativeAfterFee}(..., to=0x000...dEaD)"];
    ADD --> LP["LP tokens minted directly to 0xdead"];
    ADD --> EVT["emit Graduated(wrapper, liquidity, pair)"];
    ADD --> DUST["dust tokens & ETH split creator / treasury"];
    DUST --> REN["SovryToken(wrapper).renounceOwnership()"];
```

## 7. Pending Withdrawal Flow (pull-based ETH claims)
```mermaid
graph TD;
    B["Beneficiary"] --> WP["SovryExchange.withdrawPending(to)"];
    WP --> READ["amount = pendingWithdrawals[msg.sender]"];
    READ -->|amount == 0| REVERT["revert InvalidAmount"];
    READ -->|amount > 0| ZERO["Set pending to 0"];
    ZERO --> CALL["to.call{value: amount}"];
    CALL -->|Call failed| RESTORE["Restore pending; revert TransferFailed"];
    CALL -->|Success| DONE["ETH received"];
```

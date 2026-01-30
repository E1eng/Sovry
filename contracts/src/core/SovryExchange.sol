// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../SovryToken.sol";
import "../libraries/BondingCurveLib.sol";
import "../interfaces/IWIP.sol";
import "../interfaces/ISovryExchange.sol";

import "../interfaces/IPiperXV3Factory.sol";
import "../interfaces/IPiperXV3PositionManager.sol";
import "../interfaces/IPiperXV3SwapRouter.sol";
import "../interfaces/IRoyaltyModule.sol";

error InvalidAddress();
error InvalidAmount();
error InvalidPrice();
error CurveParamsLocked();
error InvalidThreshold();
error CurveInactive();
error TokenAlreadyLaunched();
error InsufficientBalance();
error InsufficientSupply();
error InsufficientReserves();
error TokenGraduated();
error NotAuthorized();
error TransferFailed();
error SlippageExceeded();
error ExpiredDeadline();
error RoyaltyTooSmall();
error NoRoyalties();
error InvalidStep();
error ParamsTooLarge();
error UnknownToken();
error MinListingRequired();
error InvalidLaunchAmount();
error DexLiquidityFailed();

contract SovryExchange is ReentrancyGuard, AccessControl, ISovryExchange {
    using SafeERC20 for IERC20;

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    uint256 public constant TRADE_FEE_BPS = 100;
    uint256 public constant BPS_DENOMINATOR = 10000;

    uint24 public constant PIPERX_V3_FEE = 10_000;

    uint8 public constant RT_DECIMALS = 6;
    uint256 public constant RT_UNIT = 10 ** RT_DECIMALS;

    uint8 public constant WRAPPER_DECIMALS = 18;
    uint256 public constant WRAP_UNIT = 10 ** WRAPPER_DECIMALS;
    uint256 public constant WRAP_PER_RT = (10_000 * WRAP_UNIT) / RT_UNIT;
    uint256 public constant LAUNCH_RT_AMOUNT = 100 * RT_UNIT;

    uint256 public constant MAX_BASE_PRICE = 1e18;
    uint256 public constant MAX_PRICE_INCREMENT = 1e18;

    struct CurveDefaults {
        uint128 basePrice;
        uint128 priceIncrement;
        bool finalized;
    }

    CurveDefaults public curveDefaults;

    address public immutable piperXV3Factory;
    address public immutable piperXV3SwapRouter;
    address public immutable piperXV3PositionManager;
    address public immutable royaltyWorkflows;
    address public immutable wipToken;

    address public treasury;
    uint256 public graduationThreshold;

    address public factory;
    address public router;

    uint256 public totalCurveReserves;

    event GraduationFailed(address indexed wrapperToken, string reason);
    event BuybackFailed(address indexed wrapperToken, string reason);

    struct BondingCurve {
        uint128 basePrice;
        uint128 priceIncrement;
        uint128 currentSupply;
        uint128 reserveBalance;
    }

    struct LaunchedToken {
        address rtAddress;
        address wrapperAddress;
        address creator;
        address ipAsset;
        uint256 launchTime;
        uint256 totalLocked;
        bool graduated;
        uint256 totalRoyaltiesHarvested;
        address vaultAddress;
        uint256 dexReserve;
        uint256 initialCurveSupply;
    }

    struct TokenState {
        LaunchedToken token;
        BondingCurve curve;
        uint256 currentPrice;
        uint256 marketCap;
        bool canGraduate;
        uint256 secondsSinceLaunch;
        uint256 secondsToGraduationDelay;
        bool curveActive;
    }

    mapping(address => BondingCurve) public bondingCurves;
    mapping(address => bool) public bondingCurveActive;
    mapping(address => LaunchedToken) public launchedTokens;
    mapping(address => address) public rtToWrapper;
    mapping(address => address) public wrapperToRt;

    mapping(address => uint256) public lpTokenIds;
    mapping(address => address) public dexPools;

    mapping(address => uint256) public pendingWithdrawals;
    mapping(address => uint256) public accumulatedRoyaltyNative;

    // ====== Deployment & Admin Configuration ======

    constructor(
        address _treasury,
        address _piperXV3Factory,
        address _piperXV3SwapRouter,
        address _piperXV3PositionManager,
        address _royaltyWorkflows,
        address _wipToken,
        uint256 _graduationThreshold,
        address _initialOwner
    ) {
        if (_treasury == address(0)) revert InvalidAddress();
        if (_piperXV3Factory == address(0)) revert InvalidAddress();
        if (_piperXV3SwapRouter == address(0)) revert InvalidAddress();
        if (_piperXV3PositionManager == address(0)) revert InvalidAddress();
        if (_royaltyWorkflows == address(0)) revert InvalidAddress();
        if (_wipToken == address(0)) revert InvalidAddress();
        if (_graduationThreshold == 0) revert InvalidThreshold();
        if (_initialOwner == address(0)) revert InvalidAddress();

        treasury = _treasury;
        piperXV3Factory = _piperXV3Factory;
        piperXV3SwapRouter = _piperXV3SwapRouter;
        piperXV3PositionManager = _piperXV3PositionManager;
        royaltyWorkflows = _royaltyWorkflows;
        wipToken = _wipToken;
        graduationThreshold = _graduationThreshold;

        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
    }

    function setFactory(address _factory) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_factory == address(0)) revert InvalidAddress();
        factory = _factory;
    }

    function setRouter(address _router) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_router == address(0)) revert InvalidAddress();
        router = _router;
    }

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert InvalidAddress();
        treasury = newTreasury;
    }

    function updateGraduationThreshold(uint256 newThreshold) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newThreshold == 0) revert InvalidThreshold();
        graduationThreshold = newThreshold;
        emit GraduationThresholdUpdated(newThreshold);
    }

    function setCurveParams(uint256 basePrice, uint256 priceIncrement) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (curveDefaults.finalized) revert CurveParamsLocked();
        if (basePrice == 0 || basePrice > MAX_BASE_PRICE) revert InvalidPrice();
        if (priceIncrement == 0 || priceIncrement > MAX_PRICE_INCREMENT) revert InvalidPrice();
        curveDefaults = CurveDefaults({
            basePrice: uint128(basePrice),
            priceIncrement: uint128(priceIncrement),
            finalized: true
        });
    }

    // ====== Royalty Harvesting (Pull Model) ======

    /// @dev Keeper harvests from Story Protocol vault into this contract, then routes based on graduation state.
    function harvestFromVault(address wrapperToken) external nonReentrant override {
        if (!hasRole(KEEPER_ROLE, msg.sender)) revert NotAuthorized();
        if (wrapperToken == address(0)) revert InvalidAddress();

        LaunchedToken memory token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) revert UnknownToken();

        uint256 balanceBefore = IERC20(wipToken).balanceOf(address(this));

        IRoyaltyModule(royaltyWorkflows).claimAllRevenue(token.ipAsset, address(this));

        uint256 balanceAfter = IERC20(wipToken).balanceOf(address(this));
        if (balanceAfter <= balanceBefore) return; // nothing harvested

        uint256 harvestedAmount = balanceAfter - balanceBefore;

        if (!token.graduated) {
            // Pre-graduation: unwrap to ETH and add to curve reserves (raises floor price)
            IWIP(wipToken).withdraw(harvestedAmount);

            BondingCurve storage curve = bondingCurves[wrapperToken];
            uint256 newReserve = uint256(curve.reserveBalance) + harvestedAmount;
            if (newReserve > type(uint128).max) revert ParamsTooLarge();
            curve.reserveBalance = uint128(newReserve);
            totalCurveReserves += harvestedAmount;
        } else {
            bool swapOk = _buybackAndBurnWIP(wrapperToken, harvestedAmount);
            if (!swapOk) {
                emit BuybackFailed(wrapperToken, "Swap Error");
            }
        }
    }

    function _buybackAndBurnWIP(address wrapperToken, uint256 amountWIP) internal returns (bool) {
        if (amountWIP == 0) return false;

        IERC20(wipToken).forceApprove(piperXV3SwapRouter, 0);
        IERC20(wipToken).forceApprove(piperXV3SwapRouter, amountWIP);

        IPiperXV3SwapRouter.ExactInputSingleParams memory params = IPiperXV3SwapRouter.ExactInputSingleParams({
            tokenIn: wipToken,
            tokenOut: wrapperToken,
            fee: PIPERX_V3_FEE,
            recipient: address(0x000000000000000000000000000000000000dEaD),
            deadline: block.timestamp,
            amountIn: amountWIP,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });

        try IPiperXV3SwapRouter(piperXV3SwapRouter).exactInputSingle(params) {
            return true;
        } catch {
            return false;
        }
    }

    function launchTokenFromFactory(
        address rtAddress,
        uint256 amount,
        address ipAsset,
        string calldata name,
        string calldata symbol,
        address creator
    ) external nonReentrant returns (address wrapperAddress) {
        if (msg.sender != factory) revert NotAuthorized();
        if (rtAddress == address(0)) revert InvalidAddress();
        if (ipAsset == address(0)) revert InvalidAddress();
        if (creator == address(0)) revert InvalidAddress();
        if (amount != LAUNCH_RT_AMOUNT) revert InvalidLaunchAmount();
        CurveDefaults memory defaults = curveDefaults;
        uint256 basePrice = uint256(defaults.basePrice);
        uint256 priceIncrement = uint256(defaults.priceIncrement);
        if (basePrice == 0 || priceIncrement == 0) revert InvalidPrice();
        if (rtToWrapper[rtAddress] != address(0)) revert TokenAlreadyLaunched();
        if (!defaults.finalized) revert CurveParamsLocked();

        IERC20 rt = IERC20(rtAddress);
        uint256 userBalance = rt.balanceOf(creator);
        if (amount > userBalance) revert InsufficientBalance();

        rt.safeTransferFrom(creator, address(this), amount);

        SovryToken wrapper = new SovryToken(name, symbol, rtAddress, address(this));
        wrapper.setPublicWrapping(false);
        wrapperAddress = address(wrapper);

        rtToWrapper[rtAddress] = wrapperAddress;
        wrapperToRt[wrapperAddress] = rtAddress;
        uint256 dexReserveRt = (amount * 20) / 100;

        uint256 curveSupplyRt = amount - dexReserveRt;
        uint256 curveSupplyWrapped = curveSupplyRt * WRAP_PER_RT;

        if (curveSupplyWrapped > type(uint128).max) revert ParamsTooLarge();

        bondingCurves[wrapperAddress] = BondingCurve({
            basePrice: uint128(basePrice),
            priceIncrement: uint128(priceIncrement),
            currentSupply: uint128(curveSupplyWrapped),
            reserveBalance: 0
        });
        bondingCurveActive[wrapperAddress] = true;

        launchedTokens[wrapperAddress] = LaunchedToken({
            rtAddress: rtAddress,
            wrapperAddress: wrapperAddress,
            creator: creator,
            ipAsset: ipAsset,
            launchTime: block.timestamp,
            totalLocked: amount,
            graduated: false,
            totalRoyaltiesHarvested: 0,
            vaultAddress: address(this),
            dexReserve: dexReserveRt,
            initialCurveSupply: curveSupplyWrapped
        });

        uint256 totalWrapped = amount * WRAP_PER_RT;
        wrapper.mint(address(this), totalWrapped);
    }

    // ====== Trading (Bonding Curve) ======

    function calculateBuyPrice(address wrapperToken, uint256 amount) public view returns (uint256) {
        if (!bondingCurveActive[wrapperToken]) revert CurveInactive();
        if (amount == 0) revert InvalidAmount();
        if (amount % WRAP_UNIT != 0) revert InvalidStep();

        BondingCurve memory curve = bondingCurves[wrapperToken];
        if (uint256(curve.currentSupply) < amount) revert InsufficientSupply();

        LaunchedToken memory token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) revert UnknownToken();

        return BondingCurveLib.calculateBuyPrice(
            uint256(curve.basePrice),
            uint256(curve.priceIncrement),
            uint256(curve.currentSupply),
            token.initialCurveSupply,
            amount,
            WRAP_UNIT
        );
    }

    function calculateSellPrice(address wrapperToken, uint256 amount) public view returns (uint256) {
        if (!bondingCurveActive[wrapperToken]) revert CurveInactive();
        if (amount == 0) revert InvalidAmount();
        if (amount % WRAP_UNIT != 0) revert InvalidStep();

        BondingCurve memory curve = bondingCurves[wrapperToken];
        LaunchedToken memory token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) revert UnknownToken();

        uint256 soldRaw = token.initialCurveSupply > uint256(curve.currentSupply)
            ? (token.initialCurveSupply - uint256(curve.currentSupply))
            : 0;
        if (soldRaw < amount) revert InsufficientSupply();

        return BondingCurveLib.calculateSellPrice(
            uint256(curve.basePrice),
            uint256(curve.priceIncrement),
            uint256(curve.currentSupply),
            token.initialCurveSupply,
            amount,
            WRAP_UNIT
        );
    }

    function buy(
        address wrapperToken,
        uint256 amount,
        uint256 maxEthCost,
        uint256 deadline,
        address recipient
    ) external payable nonReentrant {
        if (wrapperToken == address(0)) revert InvalidAddress();
        if (recipient == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (msg.value == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert ExpiredDeadline();

        if (msg.sender != recipient && msg.sender != router) revert NotAuthorized();

        LaunchedToken storage token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) revert UnknownToken();
        if (token.graduated) revert TokenGraduated();
        if (!bondingCurveActive[wrapperToken]) revert CurveInactive();

        if (amount % WRAP_UNIT != 0) revert InvalidStep();

        BondingCurve storage curve = bondingCurves[wrapperToken];
        if (uint256(curve.currentSupply) < amount) revert InsufficientSupply();

        uint256 baseCost = calculateBuyPrice(wrapperToken, amount);
        uint256 feeAmount = Math.mulDiv(baseCost, TRADE_FEE_BPS, BPS_DENOMINATOR);
        if (mulmod(baseCost, TRADE_FEE_BPS, BPS_DENOMINATOR) > 0) feeAmount += 1;
        uint256 totalCost = baseCost + feeAmount;

        if (totalCost > maxEthCost) revert SlippageExceeded();
        if (msg.value < totalCost) revert InsufficientBalance();

        uint256 newSupply = uint256(curve.currentSupply) - amount;
        if (newSupply > type(uint128).max) revert ParamsTooLarge();
        curve.currentSupply = uint128(newSupply);

        uint256 newReserve = uint256(curve.reserveBalance) + baseCost;
        if (newReserve > type(uint128).max) revert ParamsTooLarge();
        curve.reserveBalance = uint128(newReserve);
        totalCurveReserves += baseCost;

        IERC20(wrapperToken).safeTransfer(recipient, amount);

        _distributeFees(wrapperToken, feeAmount);

        if (msg.value > totalCost) {
            _safeTransferETH(payable(recipient), msg.value - totalCost);
        }

        emit TokensPurchased(recipient, wrapperToken, amount, baseCost, feeAmount, treasury);
    }

    function sell(
        address wrapperToken,
        uint256 amount,
        uint256 minEthProceeds,
        uint256 deadline,
        address seller
    ) external nonReentrant {
        if (wrapperToken == address(0)) revert InvalidAddress();
        if (seller == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert ExpiredDeadline();

        if (msg.sender != seller && msg.sender != router) revert NotAuthorized();

        LaunchedToken storage token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) revert UnknownToken();
        if (token.graduated) revert TokenGraduated();
        if (!bondingCurveActive[wrapperToken]) revert CurveInactive();

        IERC20(wrapperToken).safeTransferFrom(seller, address(this), amount);

        if (amount % WRAP_UNIT != 0) revert InvalidStep();

        uint256 baseProceeds = calculateSellPrice(wrapperToken, amount);
        if (address(this).balance < baseProceeds) revert InsufficientReserves();

        uint256 feeAmount = Math.mulDiv(baseProceeds, TRADE_FEE_BPS, BPS_DENOMINATOR);
        if (mulmod(baseProceeds, TRADE_FEE_BPS, BPS_DENOMINATOR) > 0) feeAmount += 1;
        uint256 netProceeds = baseProceeds - feeAmount;

        if (netProceeds < minEthProceeds) revert SlippageExceeded();

        BondingCurve storage curve = bondingCurves[wrapperToken];

        uint256 newSupply = uint256(curve.currentSupply) + amount;
        if (newSupply > type(uint128).max) revert ParamsTooLarge();
        curve.currentSupply = uint128(newSupply);

        uint256 reserveBal = uint256(curve.reserveBalance);
        if (reserveBal < baseProceeds) revert InsufficientReserves();
        curve.reserveBalance = uint128(reserveBal - baseProceeds);
        totalCurveReserves -= baseProceeds;

        _safeTransferETH(payable(seller), netProceeds);

        _distributeFees(wrapperToken, feeAmount);

        emit TokensSold(seller, wrapperToken, amount, baseProceeds, feeAmount, treasury);
    }

    // ====== Redemption ======

    function redeem(
        address wrapperToken,
        uint256 wrapperAmount,
        address recipient
    ) external nonReentrant returns (uint256 rtAmount) {
        if (wrapperToken == address(0)) revert InvalidAddress();
        if (recipient == address(0)) revert InvalidAddress();
        if (wrapperAmount == 0) revert InvalidAmount();

        LaunchedToken storage token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) revert UnknownToken();

        uint256 supplyBefore = IERC20(wrapperToken).totalSupply();
        if (supplyBefore == 0) revert InvalidAmount();

        rtAmount = Math.mulDiv(wrapperAmount, token.totalLocked, supplyBefore);
        if (rtAmount == 0) revert InvalidAmount();
        if (rtAmount > token.totalLocked) revert InsufficientBalance();

        IERC20(wrapperToken).safeTransferFrom(msg.sender, address(this), wrapperAmount);
        SovryToken(wrapperToken).burn(wrapperAmount);

        token.totalLocked -= rtAmount;
        IERC20(token.rtAddress).safeTransfer(recipient, rtAmount);

        emit TokensRedeemed(msg.sender, wrapperToken, wrapperAmount, rtAmount, recipient);
    }

    // ====== View Helpers ======

    function getMarketCap(address wrapperToken) public view returns (uint256) {
        if (!bondingCurveActive[wrapperToken]) return 0;
        LaunchedToken memory token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) return 0;

        BondingCurve memory curve = bondingCurves[wrapperToken];

        uint256 totalWrapped = IERC20(wrapperToken).totalSupply();
        uint256 totalSupplyUnits = totalWrapped / WRAP_UNIT;

        uint256 soldRaw = token.initialCurveSupply > uint256(curve.currentSupply)
            ? (token.initialCurveSupply - uint256(curve.currentSupply))
            : 0;
        uint256 soldUnits = soldRaw / WRAP_UNIT;
        uint256 currentPrice = uint256(curve.basePrice) + (soldUnits * uint256(curve.priceIncrement));

        return currentPrice * totalSupplyUnits;
    }

    // ====== Graduation Flow ======

    function graduate(address wrapperToken) external nonReentrant {
        LaunchedToken storage token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) revert UnknownToken();
        if (token.graduated) revert TokenGraduated();
        if (!bondingCurveActive[wrapperToken]) revert CurveInactive();

        uint256 marketCap = getMarketCap(wrapperToken);
        if (marketCap < graduationThreshold) revert InvalidThreshold();

        _graduate(wrapperToken);
    }

    function _checkGraduation(address wrapperToken) internal {
        LaunchedToken storage token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) return;
        if (token.graduated) return;
        if (!bondingCurveActive[wrapperToken]) return;

        uint256 marketCap = getMarketCap(wrapperToken);
        if (marketCap >= graduationThreshold) {
            _graduate(wrapperToken);
        }
    }

    function _graduate(address wrapperToken) internal {
        LaunchedToken storage token = launchedTokens[wrapperToken];
        BondingCurve storage curve = bondingCurves[wrapperToken];

        token.graduated = true;
        bondingCurveActive[wrapperToken] = false;

        uint256 nativeLiquidity = uint256(curve.reserveBalance);
        if (nativeLiquidity > 0) {
            totalCurveReserves -= nativeLiquidity;
            curve.reserveBalance = 0;
        }

        uint256 dexReserveWrapped = token.dexReserve * WRAP_PER_RT;
        uint256 tokenLiquidity = dexReserveWrapped + uint256(curve.currentSupply);

        if (nativeLiquidity == 0 || tokenLiquidity == 0) revert InvalidAmount();

        uint256 feeTotal = nativeLiquidity / 10;
        uint256 treasuryCut = feeTotal / 2;
        uint256 ipaCut = feeTotal - treasuryCut;

        if (treasuryCut > 0) {
            _safeTransferETH(payable(treasury), treasuryCut);
        }
        if (ipaCut > 0) {
            _accrueRoyalty(wrapperToken, ipaCut);
        }

        uint256 nativeAfterFee = nativeLiquidity - feeTotal;
        if (nativeAfterFee == 0) revert InvalidAmount();

        uint256 supply = uint256(curve.currentSupply);
        uint256 soldRaw = token.initialCurveSupply > supply ? (token.initialCurveSupply - supply) : 0;
        uint256 soldUnits = soldRaw / WRAP_UNIT;
        uint256 spotPrice = uint256(curve.basePrice) + (soldUnits * uint256(curve.priceIncrement));
        if (spotPrice == 0) revert InvalidPrice();

        (address token0, address token1) = wrapperToken < wipToken
            ? (wrapperToken, wipToken)
            : (wipToken, wrapperToken);

        uint160 sqrtPriceX96 = _getSqrtPriceX96(spotPrice, wrapperToken, token0);

        IPiperXV3PositionManager positionManager = IPiperXV3PositionManager(piperXV3PositionManager);
        address poolAddress = positionManager.createAndInitializePoolIfNecessary(token0, token1, PIPERX_V3_FEE, sqrtPriceX96);

        IWIP(wipToken).deposit{value: nativeAfterFee}();

        IERC20(wrapperToken).forceApprove(piperXV3PositionManager, tokenLiquidity);
        IERC20(wipToken).forceApprove(piperXV3PositionManager, nativeAfterFee);

        int24 tickSpacing = IPiperXV3Factory(piperXV3Factory).feeAmountTickSpacing(PIPERX_V3_FEE);
        (int24 tickLower, int24 tickUpper) = _getFullRangeTicks(tickSpacing);

        uint256 amount0Desired = token0 == wrapperToken ? tokenLiquidity : nativeAfterFee;
        uint256 amount1Desired = token1 == wrapperToken ? tokenLiquidity : nativeAfterFee;

        uint256 amount0;
        uint256 amount1;
        uint128 liquidity;
        uint256 tokenId;

        try positionManager.mint(
            IPiperXV3PositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: PIPERX_V3_FEE,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp + 300
            })
        ) returns (uint256 _tokenId, uint128 _liquidity, uint256 _amount0, uint256 _amount1) {
            tokenId = _tokenId;
            liquidity = _liquidity;
            amount0 = _amount0;
            amount1 = _amount1;
        } catch {
            curve.currentSupply = 0;
            curve.reserveBalance = 0;
            accumulatedRoyaltyNative[wrapperToken] = 0;
            IERC20(wrapperToken).safeTransfer(treasury, tokenLiquidity);
            IWIP(wipToken).withdraw(nativeAfterFee);
            _safeTransferETH(payable(treasury), nativeAfterFee);
            bondingCurveActive[wrapperToken] = false;
            emit GraduationFailed(wrapperToken, "Liquidity sent to Treasury");
            SovryToken(wrapperToken).unlockTransfers();
            SovryToken(wrapperToken).renounceOwnership();
            return;
        }

        lpTokenIds[wrapperToken] = tokenId;
        dexPools[wrapperToken] = poolAddress;
        emit Graduated(wrapperToken, uint256(liquidity), poolAddress);

        curve.currentSupply = 0;

        uint256 usedWrapper = token0 == wrapperToken ? amount0 : amount1;
        uint256 usedWip = token0 == wipToken ? amount0 : amount1;

        uint256 dustTokens = tokenLiquidity > usedWrapper ? (tokenLiquidity - usedWrapper) : 0;
        uint256 dustWip = nativeAfterFee > usedWip ? (nativeAfterFee - usedWip) : 0;

        if (dustTokens > 0) {
            uint256 treasuryTokens = dustTokens / 2;
            uint256 ipaTokens = dustTokens - treasuryTokens;
            if (treasuryTokens > 0) IERC20(wrapperToken).safeTransfer(treasury, treasuryTokens);
            if (ipaTokens > 0) IERC20(wrapperToken).safeTransfer(token.ipAsset, ipaTokens);
        }

        if (dustWip > 0) {
            IWIP(wipToken).withdraw(dustWip);
            uint256 treasuryDust = dustWip / 2;
            uint256 ipaDust = dustWip - treasuryDust;
            if (treasuryDust > 0) _safeTransferETH(payable(treasury), treasuryDust);
            if (ipaDust > 0) _accrueRoyalty(wrapperToken, ipaDust);
        }

        SovryToken(wrapperToken).unlockTransfers();
        SovryToken(wrapperToken).renounceOwnership();
    }

    // ====== Keeper Operations ======

    /// @dev Push accumulated native fees into Story Protocol vault as WIP royalties.
    function pushFeesToVault(address wrapperToken) external nonReentrant override {
        if (!hasRole(KEEPER_ROLE, msg.sender)) revert NotAuthorized();
        if (wrapperToken == address(0)) revert InvalidAddress();

        LaunchedToken storage token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) revert UnknownToken();

        uint256 amount = accumulatedRoyaltyNative[wrapperToken];
        if (amount == 0) return;
        if (address(this).balance < amount) revert InsufficientReserves();

        accumulatedRoyaltyNative[wrapperToken] = 0;

        IWIP(wipToken).deposit{value: amount}();
        IERC20(wipToken).forceApprove(royaltyWorkflows, amount);

        IRoyaltyModule(royaltyWorkflows).payRoyaltyOnBehalf(token.ipAsset, address(this), wipToken, amount);

        emit RoyaltyRevenueProcessed(wrapperToken, amount, token.ipAsset);
    }

    function distributeRoyalties(address wrapperToken, uint256 wipAmount, uint256 /* amountOutMin */) external nonReentrant {
        if (!hasRole(KEEPER_ROLE, msg.sender)) revert NotAuthorized();
        if (wrapperToken == address(0)) revert InvalidAddress();
        if (wipAmount == 0) revert InvalidAmount();

        LaunchedToken storage token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) revert UnknownToken();
        if (wipAmount < 0.001 ether) revert RoyaltyTooSmall();

        IERC20(wipToken).safeTransferFrom(msg.sender, address(this), wipAmount);

        token.totalRoyaltiesHarvested += wipAmount;
        emit RoyaltiesHarvested(wrapperToken, wipAmount);

        uint256 treasuryShare = wipAmount / 2;
        uint256 ipaShare = wipAmount - treasuryShare;
        if (treasuryShare > 0) IERC20(wipToken).safeTransfer(treasury, treasuryShare);
        if (ipaShare > 0) IERC20(wipToken).safeTransfer(token.ipAsset, ipaShare);
    }

    function harvestDexFees(address wrapperToken, uint256) external nonReentrant {
        if (!hasRole(KEEPER_ROLE, msg.sender)) revert NotAuthorized();
        if (wrapperToken == address(0)) revert InvalidAddress();

        LaunchedToken storage token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) revert UnknownToken();
        if (!token.graduated) revert TokenGraduated();

        uint256 tokenId = lpTokenIds[wrapperToken];
        if (tokenId == 0) revert InvalidAmount();

        (address token0, ) = wrapperToken < wipToken
            ? (wrapperToken, wipToken)
            : (wipToken, wrapperToken);

        IPiperXV3PositionManager positionManager = IPiperXV3PositionManager(piperXV3PositionManager);
        (uint256 amount0, uint256 amount1) = positionManager.collect(
            IPiperXV3PositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        uint256 wrapperFees = token0 == wrapperToken ? amount0 : amount1;
        uint256 wipFees = token0 == wipToken ? amount0 : amount1;

        if (wrapperFees > 0) {
            uint256 treasuryShareWrap = wrapperFees / 2;
            uint256 ipaShareWrap = wrapperFees - treasuryShareWrap;
            if (treasuryShareWrap > 0) IERC20(wrapperToken).safeTransfer(treasury, treasuryShareWrap);
            if (ipaShareWrap > 0) IERC20(wrapperToken).safeTransfer(token.ipAsset, ipaShareWrap);
        }

        if (wipFees > 0) {
            uint256 treasuryShareWip = wipFees / 2;
            uint256 ipaShareWip = wipFees - treasuryShareWip;
            if (treasuryShareWip > 0) IERC20(wipToken).safeTransfer(treasury, treasuryShareWip);
            if (ipaShareWip > 0) IERC20(wipToken).safeTransfer(token.ipAsset, ipaShareWip);
        }
    }

    // ====== Withdrawals ======

    function withdrawPending(address payable to) external nonReentrant {
        if (to == address(0)) revert InvalidAddress();

        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert InvalidAmount();

        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) {
            pendingWithdrawals[msg.sender] = amount;
            revert TransferFailed();
        }
    }

    // ====== Internal Helpers ======

    function _enqueuePendingWithdrawal(address beneficiary, uint256 amount) internal {
        if (beneficiary == address(0)) revert InvalidAddress();
        if (amount == 0) return;

        pendingWithdrawals[beneficiary] += amount;
        emit PendingWithdrawal(beneficiary, amount);
    }

    function _safeTransferETH(address payable to, uint256 amount) internal {
        if (amount == 0) return;

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) {
            pendingWithdrawals[to] += amount;
            emit PendingWithdrawal(to, amount);
        }
    }

    function _accrueRoyalty(address wrapperToken, uint256 amount) internal {
        if (amount == 0) return;
        accumulatedRoyaltyNative[wrapperToken] += amount;
        emit RoyaltyRevenueQueued(wrapperToken, amount);
    }

    function _distributeFees(address wrapperToken, uint256 feeAmount) private {
        if (feeAmount == 0) return;
        uint256 treasuryShare = feeAmount / 2;
        uint256 ipaShare = feeAmount - treasuryShare;

        if (treasuryShare > 0) {
            _enqueuePendingWithdrawal(treasury, treasuryShare);
        }
        if (ipaShare > 0) {
            _accrueRoyalty(wrapperToken, ipaShare);
        }
    }

    function _getSqrtPriceX96(uint256 spotPrice, address wrapperToken, address token0) internal pure returns (uint160) {
        uint256 priceX192;
        uint256 q192 = uint256(1) << 192;

        if (token0 == wrapperToken) {
            priceX192 = Math.mulDiv(spotPrice, q192, WRAP_UNIT);
        } else {
            priceX192 = Math.mulDiv(WRAP_UNIT, q192, spotPrice);
        }

        return uint160(Math.sqrt(priceX192));
    }

    function _getFullRangeTicks(int24 tickSpacing) internal pure returns (int24 tickLower, int24 tickUpper) {
        int24 minTick = -887272;
        int24 maxTick = 887272;

        tickLower = (minTick / tickSpacing) * tickSpacing;
        if (tickLower > minTick) tickLower -= tickSpacing;

        tickUpper = (maxTick / tickSpacing) * tickSpacing;
    }

    receive() external payable {}
}

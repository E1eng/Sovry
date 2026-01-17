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

interface IPiperXRouter {
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function factory() external view returns (address);

    function WETH() external view returns (address);
}

interface IPiperXFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

error InvalidAddress();
error InvalidAmount();
error InvalidPrice();
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
error DexLiquidityFailed();

contract SovryExchange is ReentrancyGuard, AccessControl, ISovryExchange {
    using SafeERC20 for IERC20;

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    uint256 public constant TRADE_FEE_BPS = 20;
    uint256 public constant BPS_DENOMINATOR = 10000;

    uint8 public constant RT_DECIMALS = 6;
    uint256 public constant RT_UNIT = 10 ** RT_DECIMALS;
    uint256 public constant MIN_LISTING_AMOUNT = 100 * RT_UNIT;

    uint8 public constant WRAPPER_DECIMALS = 6;
    uint256 public constant WRAP_UNIT = 10 ** WRAPPER_DECIMALS;
    uint256 public constant WRAP_PER_RT = 1_000_000;

    uint256 public constant MAX_BASE_PRICE = 1e18;
    uint256 public constant MAX_PRICE_INCREMENT = 1e18;

    address public immutable piperXRouter;
    address public immutable royaltyWorkflows;
    address public immutable wipToken;

    address public treasury;
    uint256 public graduationThreshold;

    address public factory;
    address public router;

    uint256 public totalCurveReserves;

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

    mapping(address => uint256) public pendingWithdrawals;

    constructor(
        address _treasury,
        address _piperXRouter,
        address _royaltyWorkflows,
        address _wipToken,
        uint256 _graduationThreshold,
        address _initialOwner
    ) {
        if (_treasury == address(0)) revert InvalidAddress();
        if (_piperXRouter == address(0)) revert InvalidAddress();
        if (_royaltyWorkflows == address(0)) revert InvalidAddress();
        if (_wipToken == address(0)) revert InvalidAddress();
        if (_graduationThreshold == 0) revert InvalidThreshold();
        if (_initialOwner == address(0)) revert InvalidAddress();

        treasury = _treasury;
        piperXRouter = _piperXRouter;
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

    function launchTokenFromFactory(
        address rtAddress,
        uint256 amount,
        string calldata name,
        string calldata symbol,
        uint256 basePrice,
        uint256 priceIncrement,
        address creator
    ) external nonReentrant returns (address wrapperAddress) {
        if (msg.sender != factory) revert NotAuthorized();
        if (rtAddress == address(0)) revert InvalidAddress();
        if (creator == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (basePrice == 0 || basePrice > MAX_BASE_PRICE) revert InvalidPrice();
        if (priceIncrement == 0 || priceIncrement > MAX_PRICE_INCREMENT) revert InvalidPrice();
        if (rtToWrapper[rtAddress] != address(0)) revert TokenAlreadyLaunched();
        if (amount < MIN_LISTING_AMOUNT) revert MinListingRequired();

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

        if (feeAmount > 0) {
            _enqueuePendingWithdrawal(token.creator, feeAmount);
        }

        if (msg.value > totalCost) {
            _safeTransferETH(payable(recipient), msg.value - totalCost);
        }

        emit TokensPurchased(recipient, wrapperToken, amount, baseCost, feeAmount, token.creator);
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

        if (feeAmount > 0) {
            _enqueuePendingWithdrawal(token.creator, feeAmount);
        }

        emit TokensSold(seller, wrapperToken, amount, baseProceeds, feeAmount, token.creator);
    }

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

    function getTokenState(address wrapperToken) external view returns (TokenState memory) {
        LaunchedToken memory token = launchedTokens[wrapperToken];
        BondingCurve memory curve = bondingCurves[wrapperToken];

        uint256 currentPrice;
        uint256 marketCap;
        bool canGraduate;
        uint256 secondsSinceLaunch;
        uint256 secondsToGraduationDelay;

        bool isActive = bondingCurveActive[wrapperToken];

        if (token.wrapperAddress != address(0)) {
            if (token.launchTime > 0 && block.timestamp >= token.launchTime) {
                secondsSinceLaunch = block.timestamp - token.launchTime;
            }

            if (isActive) {
                uint256 soldRaw = token.initialCurveSupply > uint256(curve.currentSupply)
                    ? (token.initialCurveSupply - uint256(curve.currentSupply))
                    : 0;
                uint256 soldUnits = soldRaw / WRAP_UNIT;
                currentPrice = uint256(curve.basePrice) + (soldUnits * uint256(curve.priceIncrement));
            }

            marketCap = getMarketCap(wrapperToken);

            if (!token.graduated && isActive && marketCap >= graduationThreshold) {
                canGraduate = true;
            }
        }

        return TokenState({
            token: token,
            curve: curve,
            currentPrice: currentPrice,
            marketCap: marketCap,
            canGraduate: canGraduate,
            secondsSinceLaunch: secondsSinceLaunch,
            secondsToGraduationDelay: secondsToGraduationDelay,
            curveActive: isActive
        });
    }

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
        uint256 creatorCut = feeTotal / 2;
        uint256 treasuryCut = feeTotal - creatorCut;

        if (creatorCut > 0) {
            (bool ok, ) = payable(token.creator).call{value: creatorCut}("");
            if (!ok) revert TransferFailed();
        }
        if (treasuryCut > 0) {
            (bool ok2, ) = payable(treasury).call{value: treasuryCut}("");
            if (!ok2) revert TransferFailed();
        }

        uint256 nativeAfterFee = nativeLiquidity - feeTotal;
        if (nativeAfterFee == 0) revert InvalidAmount();

        IPiperXRouter router_ = IPiperXRouter(piperXRouter);
        address factory_ = router_.factory();
        address weth = router_.WETH();

        IERC20(wrapperToken).forceApprove(piperXRouter, tokenLiquidity);

        uint256 amountToken;
        uint256 amountETH;
        uint256 liquidity;

        try router_.addLiquidityETH{value: nativeAfterFee}(
            wrapperToken,
            tokenLiquidity,
            0,
            0,
            address(0x000000000000000000000000000000000000dEaD),
            block.timestamp + 300
        ) returns (uint256 _amountToken, uint256 _amountETH, uint256 _liquidity) {
            amountToken = _amountToken;
            amountETH = _amountETH;
            liquidity = _liquidity;
            address poolAddress = IPiperXFactory(factory_).getPair(wrapperToken, weth);
            emit Graduated(wrapperToken, liquidity, poolAddress);
        } catch {
            revert DexLiquidityFailed();
        }

        uint256 dustTokens = tokenLiquidity > amountToken ? (tokenLiquidity - amountToken) : 0;
        uint256 dustETH = nativeAfterFee > amountETH ? (nativeAfterFee - amountETH) : 0;

        if (dustTokens > 0) {
            uint256 creatorTokens = dustTokens / 2;
            uint256 treasuryTokens = dustTokens - creatorTokens;
            if (creatorTokens > 0) IERC20(wrapperToken).safeTransfer(token.creator, creatorTokens);
            if (treasuryTokens > 0) IERC20(wrapperToken).safeTransfer(treasury, treasuryTokens);
        }

        if (dustETH > 0) {
            uint256 creatorDust = dustETH / 2;
            uint256 treasuryDust = dustETH - creatorDust;
            if (creatorDust > 0) _safeTransferETH(payable(token.creator), creatorDust);
            if (treasuryDust > 0) _safeTransferETH(payable(treasury), treasuryDust);
        }

        SovryToken(wrapperToken).renounceOwnership();
    }

    function depositRoyalties(address wrapperToken, uint256 wipAmount) external nonReentrant {
        if (!hasRole(KEEPER_ROLE, msg.sender)) revert NotAuthorized();
        if (wrapperToken == address(0)) revert InvalidAddress();
        if (wipAmount == 0) revert InvalidAmount();

        LaunchedToken storage token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) revert UnknownToken();
        if (wipAmount < 0.001 ether) revert RoyaltyTooSmall();

        IERC20(wipToken).safeTransferFrom(msg.sender, address(this), wipAmount);

        uint256 nativeBefore = address(this).balance;
        IWIP(wipToken).withdraw(wipAmount);
        uint256 claimedAmount = address(this).balance - nativeBefore;
        if (claimedAmount == 0) revert NoRoyalties();

        token.totalRoyaltiesHarvested += claimedAmount;
        emit RoyaltiesHarvested(wrapperToken, claimedAmount);

        if (!token.graduated && bondingCurveActive[wrapperToken]) {
            _applyRoyaltiesToBondingCurve(wrapperToken, claimedAmount);
            _checkGraduation(wrapperToken);
        } else {
            _buybackAndBurn(wrapperToken, claimedAmount);
        }
    }

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

    function _applyRoyaltiesToBondingCurve(address wrapperToken, uint256 claimedAmount) internal {
        BondingCurve storage curve = bondingCurves[wrapperToken];
        uint256 supply = uint256(curve.currentSupply);

        if (supply < WRAP_UNIT) {
            uint256 newReserve = uint256(curve.reserveBalance) + claimedAmount;
            if (newReserve > type(uint128).max) revert ParamsTooLarge();
            curve.reserveBalance = uint128(newReserve);
            totalCurveReserves += claimedAmount;
            return;
        }

        LaunchedToken storage token = launchedTokens[wrapperToken];
        uint256 initialCurveSupply = token.initialCurveSupply;
        uint256 soldRaw = initialCurveSupply > supply ? (initialCurveSupply - supply) : 0;
        uint256 soldUnits = soldRaw / WRAP_UNIT;

        uint256 maxUnits = supply / WRAP_UNIT;
        if (maxUnits == 0) {
            uint256 newReserve2 = uint256(curve.reserveBalance) + claimedAmount;
            if (newReserve2 > type(uint128).max) revert ParamsTooLarge();
            curve.reserveBalance = uint128(newReserve2);
            totalCurveReserves += claimedAmount;
            return;
        }

        uint256 basePrice = uint256(curve.basePrice);
        uint256 priceIncrement = uint256(curve.priceIncrement);

        uint256 unitsToBuy;

        if (priceIncrement == 0) {
            uint256 currentPricePerUnit = basePrice;
            if (currentPricePerUnit == 0) {
                uint256 newReserve3 = uint256(curve.reserveBalance) + claimedAmount;
                if (newReserve3 > type(uint128).max) revert ParamsTooLarge();
                curve.reserveBalance = uint128(newReserve3);
                totalCurveReserves += claimedAmount;
                return;
            }
            unitsToBuy = claimedAmount / currentPricePerUnit;
        } else {
            uint256 B = basePrice + (priceIncrement * soldUnits);
            uint256 twoAC = 2 * priceIncrement * claimedAmount;
            uint256 D = (B * B) + twoAC;
            uint256 sqrtD = Math.sqrt(D);
            if (sqrtD <= B) {
                uint256 newReserve4 = uint256(curve.reserveBalance) + claimedAmount;
                if (newReserve4 > type(uint128).max) revert ParamsTooLarge();
                curve.reserveBalance = uint128(newReserve4);
                totalCurveReserves += claimedAmount;
                return;
            }
            unitsToBuy = (sqrtD - B) / priceIncrement;
        }

        if (unitsToBuy > maxUnits) unitsToBuy = maxUnits;
        if (unitsToBuy == 0) {
            uint256 newReserve5 = uint256(curve.reserveBalance) + claimedAmount;
            if (newReserve5 > type(uint128).max) revert ParamsTooLarge();
            curve.reserveBalance = uint128(newReserve5);
            totalCurveReserves += claimedAmount;
            return;
        }

        uint256 amount = unitsToBuy * WRAP_UNIT;

        uint256 newSupply = supply - amount;
        if (newSupply > type(uint128).max) revert ParamsTooLarge();
        curve.currentSupply = uint128(newSupply);

        uint256 newReserve6 = uint256(curve.reserveBalance) + claimedAmount;
        if (newReserve6 > type(uint128).max) revert ParamsTooLarge();
        curve.reserveBalance = uint128(newReserve6);
        totalCurveReserves += claimedAmount;

        IERC20(wrapperToken).safeTransfer(address(0x000000000000000000000000000000000000dEaD), amount);
    }

    function _buybackAndBurn(address wrapperToken, uint256 wipAmount) internal {
        IPiperXRouter router_ = IPiperXRouter(piperXRouter);
        address factory_ = router_.factory();
        address weth = router_.WETH();
        address pair = IPiperXFactory(factory_).getPair(weth, wrapperToken);
        if (pair == address(0)) {
            return;
        }

        address[] memory path = new address[](2);
        path[0] = weth;
        path[1] = wrapperToken;

        router_.swapExactETHForTokens{value: wipAmount}(
            1,
            path,
            address(0x000000000000000000000000000000000000dEaD),
            block.timestamp + 300
        );
    }

    receive() external payable {}
}

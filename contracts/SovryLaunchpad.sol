// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./SovryToken.sol";
import "./libraries/BondingCurveLib.sol";

/**
 * @notice Interface for Story Protocol Royalty Workflows
 * @dev Used for claiming royalties from Story Protocol
 */
interface IRoyaltyWorkflows {
    function claimAllRevenue(
        address ancestorIpId,
        address claimer,
        address[] calldata childIpIds,
        address[] calldata royaltyPolicies,
        address[] calldata currencyTokens
    ) external returns (uint256[] memory amountsClaimed);
}

/**
 * @notice Interface for PiperX V2 Router
 * @dev Used for adding liquidity when tokens graduate and for swap-based buyback after graduation
 */
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

interface IWrappedNative {
    function withdraw(uint256 amount) external;
}

// Custom Errors (saves ~2KB vs require strings)
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
error PremineLocked();

/**
 * @title SovryLaunchpad
 * @author Sovry
 * @notice A token launchpad with linear bonding curve mechanics, wrapper functionality, and royalty harvesting
 * @dev Implements a linear bonding curve for price discovery, allows fractional listing of royalty tokens,
 *      harvests royalties to pump the floor price, and graduates tokens to DEX when market cap threshold is reached
 */
contract SovryLaunchpad is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    /// @notice Treasury address that receives trading fees
    address public treasury;

    /// @notice Total trading fee in basis points (100 = 1%)
    uint256 public constant TOTAL_FEE_BPS = 100;

    /// @notice Creator share of the trading fee, in basis points of TOTAL_FEE_BPS (50 = 50% of 1% = 0.5%)
    uint256 public constant CREATOR_FEE_BPS = 50;

    /// @notice Protocol (treasury) share of the trading fee, in basis points of TOTAL_FEE_BPS (50 = 50% of 1% = 0.5%)
    uint256 public constant PROTOCOL_FEE_BPS = 50;

    /// @notice Creator premine allocation in basis points of total locked supply (500 = 5%)
    uint256 public constant CREATOR_PREMINE_BPS = 500;

    /// @notice Basis points denominator (10000 = 100%)
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice RT decimals (Story Royalty Tokens use 6 decimals)
    uint8 public constant RT_DECIMALS = 6;

    /// @notice RT unit in smallest units
    uint256 public constant RT_UNIT = 10 ** RT_DECIMALS;

    /// @notice Minimum listing amount (25 RT)
    uint256 public constant MIN_LISTING_AMOUNT = 25 * RT_UNIT;

    /// @notice Wrapper token decimals (SovryToken uses 6 decimals)
    uint8 public constant WRAPPER_DECIMALS = 6;

    /// @notice One whole wrapper token in smallest units
    uint256 public constant WRAP_UNIT = 10 ** WRAPPER_DECIMALS;

    /// @notice Wrapper smallest units minted per 1 RT smallest unit (UI-level 1:1,000,000 ratio per RT)
    uint256 public constant WRAP_PER_RT = 1_000_000;

    /// @notice Safety cap for basePrice to keep bonding curve math well below uint256 overflow bounds
    /// @dev Reduced to 1e18 wei to prevent overflow in quadratic calculations
    /// @dev This is still ~1 billion USD per token unit on most chains
    uint256 public constant MAX_BASE_PRICE = 1e18;

    /// @notice Safety cap for priceIncrement to keep quadratic term bounded
    /// @dev Reduced to 1e18 wei per unit to prevent overflow
    /// @dev Formula: priceIncrement * soldUnits * amountUnits must stay < 1e77 (uint256 max)
    uint256 public constant MAX_PRICE_INCREMENT = 1e18;

    /// @notice Default graduation threshold in wei (e.g., $69,000 worth of native token)
    uint256 public graduationThreshold;

    /// @notice Minimum time that market cap must stay above the graduation threshold before a token can graduate
    uint256 public constant GRADUATION_DELAY = 15 minutes;

    /// @notice PiperX V2 Router address for liquidity migration
    address public piperXRouter;

    /// @notice Story Protocol Royalty Workflows contract address
    address public royaltyWorkflows;

    /// @notice WIP token address (native token on Story Protocol)
    address public wipToken;

    /// @notice Burn address used for LP tokens and buyback-and-burn flows
    address public constant BURN_ADDRESS = address(0x000000000000000000000000000000000000dEaD);

    /// @notice Minimum share of token/native liquidity (in basis points) that must be added during DEX migration
    uint256 public constant DEX_LP_MIN_BPS = 9500;

    /**
     * @notice Bonding curve structure for each launched token
     * @param basePrice Starting price of the token (in wei)
     * @param priceIncrement Price increase per token unit
     * @param currentSupply Current supply of tokens in the curve
     * @param reserveBalance Total reserve balance (native token) in the curve
     * @param isActive Whether the bonding curve is active (not graduated)
     */
    struct BondingCurve {
        uint256 basePrice;
        uint256 priceIncrement;
        uint256 currentSupply;
        uint256 reserveBalance;
        bool isActive;
    }

    /**
     * @notice Launched token information
     * @param rtAddress Address of the underlying Royalty Token (RT)
     * @param wrapperAddress Address of the wrapper token (SovryToken)
     * @param creator Address that launched the token
     * @param launchTime Timestamp when the token was launched
     * @param totalLocked Total amount of RT locked in the vault (RT smallest units)
     * @param graduated Whether the token has graduated to DEX
     * @param totalRoyaltiesHarvested Total royalties harvested for this token
     * @param vaultAddress Address of the vault holding locked RT (this contract)
     * @param dexReserve Reserve amount for DEX liquidity in RT smallest units
     * @param initialCurveSupply Initial wrapper token supply assigned to the bonding curve (wrapper smallest units)
     */
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
    }

    /// @notice Mapping from wrapper token address to bonding curve data
    mapping(address => BondingCurve) public bondingCurves;

    /// @notice Mapping from wrapper token address to launched token info
    mapping(address => LaunchedToken) public launchedTokens;

    /// @notice Mapping from RT address to wrapper token address
    mapping(address => address) public rtToWrapper;

    /// @notice Mapping from wrapper token to RT address
    mapping(address => address) public wrapperToRt;

    /// @notice Mapping from user address to wrapper token to pending buyback amount
    mapping(address => uint256) public pendingBuybacks;

    /// @notice Optional designated harvester per wrapper token
    mapping(address => address) public tokenHarvesters;

    /// @notice Total native reserves held by all bonding curves
    uint256 public totalCurveReserves;

    /// @notice Locked creator premine amount per wrapper token (wrapper smallest units)
    mapping(address => uint256) public creatorPremineLocked;

    /// @notice Unlock timestamp for creator premine per wrapper token
    mapping(address => uint256) public creatorPremineUnlockTime;

    /**
     * @notice Event emitted when a token is launched
     * @param rt Address of the royalty token
     * @param wrapper Address of the wrapper token
     * @param creator Address that launched the token
     * @param amount Amount of RT locked
     * @param launchTime Timestamp of launch
     */
    event TokenLaunched(
        address indexed rt,
        address indexed wrapper,
        address indexed creator,
        uint256 amount,
        uint256 launchTime
    );

    /// @notice Event emitted when tokens are purchased from the bonding curve
    /// @param buyer Address that purchased tokens
    /// @param wrapperToken Address of the wrapper token
    /// @param amount Amount of tokens purchased
    /// @param cost Total cost paid (including fees)
    event TokensPurchased(
        address indexed buyer,
        address indexed wrapperToken,
        uint256 amount,
        uint256 cost
    );

    /// @notice Event emitted when tokens are sold back to the bonding curve
    /// @param seller Address that sold tokens
    /// @param wrapperToken Address of the wrapper token
    /// @param amount Amount of tokens sold
    /// @param proceeds Total proceeds received (after fees)
    event TokensSold(
        address indexed seller,
        address indexed wrapperToken,
        uint256 amount,
        uint256 proceeds
    );

    /// @notice Event emitted when royalties are harvested
    /// @param wrapperToken Address of the wrapper token
    /// @param amount Amount of royalties harvested
    event RoyaltiesHarvested(
        address indexed wrapperToken,
        uint256 amount
    );

    /// @notice Event emitted when royalties are used to buy back and burn wrapper tokens on DEX
    /// @param wrapperToken Address of the wrapper token
    /// @param wipSpent Amount of WIP/native spent in the buyback
    /// @param wrapperBurned Amount of wrapper tokens sent to the burn address
    event BuybackAndBurn(
        address indexed wrapperToken,
        uint256 wipSpent,
        uint256 wrapperBurned
    );

    /// @notice Event emitted when a buyback attempt fails or cannot be executed safely
    /// @param wrapperToken Address of the wrapper token
    /// @param wipAmount Amount of WIP/native that remains pending for future buyback
    event BuybackFailed(address indexed wrapperToken, uint256 wipAmount);

    /// @notice Event emitted when reserves are increased after royalty injection
    /// @param wrapperToken Address of the wrapper token
    /// @param newReserveAmount New total reserve amount
    event ReservesIncreased(
        address indexed wrapperToken,
        uint256 newReserveAmount
    );

    /// @notice Event emitted when a token graduates to DEX
    /// @param wrapperToken Address of the wrapper token
    /// @param liquidity Amount of liquidity migrated
    /// @param poolAddress Address of the created liquidity pool
    event Graduated(
        address indexed wrapperToken,
        uint256 liquidity,
        address indexed poolAddress
    );

    /// @notice Event emitted when fees are collected
    /// @param wrapperToken Address of the wrapper token
    /// @param amount Amount of fees collected
    event FeesCollected(
        address indexed wrapperToken,
        uint256 amount
    );

    /// @notice Event emitted when creator receives a share of trading fees
    /// @param wrapperToken Address of the wrapper token
    /// @param creator Address of the token creator
    /// @param amount Amount of fees sent to the creator
    event CreatorFeePaid(
        address indexed wrapperToken,
        address indexed creator,
        uint256 amount
    );

    event CreatorPremineClaimed(
        address indexed wrapperToken,
        address indexed creator,
        uint256 amount
    );

    event GraduationThresholdUpdated(uint256 newThreshold);

    /// @notice Event emitted when wrapper token ownership is renounced upon graduation
    /// @param wrapperToken Address of the wrapper token
    /// @dev Indicates the token is now fully decentralized and trustless
    event OwnershipRenounced(address indexed wrapperToken);

    /// @notice Event emitted when a harvester is set or updated for a wrapper token
    /// @param wrapperToken Address of the wrapper token
    /// @param harvester Address authorized to harvest for this token (can be zero address to clear)
    event HarvesterUpdated(address indexed wrapperToken, address harvester);

    /**
     * @notice Constructor initializes the launchpad
     * @param _treasury Address that will receive trading fees
     * @param _piperXRouter Address of PiperX V2 Router
     * @param _royaltyWorkflows Address of Story Protocol Royalty Workflows contract
     * @param _wipToken Address of WIP token (native token)
     * @param _graduationThreshold Market cap threshold for graduation (in wei)
     * @param _initialOwner Address that will own the contract
     */
    constructor(
        address _treasury,
        address _piperXRouter,
        address _royaltyWorkflows,
        address _wipToken,
        uint256 _graduationThreshold,
        address _initialOwner
    ) Ownable(_initialOwner) {
        if (_treasury == address(0)) revert InvalidAddress();
        if (_piperXRouter == address(0)) revert InvalidAddress();
        if (_royaltyWorkflows == address(0)) revert InvalidAddress();
        if (_wipToken == address(0)) revert InvalidAddress();
        if (_graduationThreshold == 0) revert InvalidThreshold();

        treasury = _treasury;
        piperXRouter = _piperXRouter;
        royaltyWorkflows = _royaltyWorkflows;
        wipToken = _wipToken;
        graduationThreshold = _graduationThreshold;
    }

    /**
     * @notice Sets or clears the designated harvester for a given wrapper token
     * @param wrapperToken Address of the wrapper token
     * @param harvester Address authorized to call harvest for this token (zero address to clear)
     * @dev Can be called by the global owner or the specific token creator
     */
    function setTokenHarvester(address wrapperToken, address harvester) external {
        LaunchedToken storage token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) revert UnknownToken();

        // Allow contract owner or token creator to manage harvester
        if (msg.sender != owner() && msg.sender != token.creator) {
            revert NotAuthorized();
        }

        tokenHarvesters[wrapperToken] = harvester;
        emit HarvesterUpdated(wrapperToken, harvester);
    }

    /**
     * @notice Internal helper to consolidate launch logic
     * @dev Reduces bytecode by extracting common logic from launchToken & launchTokenPrefunded
     */
    function _launchCore(
        address rtAddress,
        uint256 amount,
        string calldata name,
        string calldata symbol,
        uint256 basePrice,
        uint256 priceIncrement,
        address creator
    ) private returns (address) {
        // Deploy wrapper token
        SovryToken wrapper = new SovryToken(name, symbol, rtAddress, address(this));
        wrapper.setPublicWrapping(false);
        address wrapperAddress = address(wrapper);

        // Update mappings
        rtToWrapper[rtAddress] = wrapperAddress;
        wrapperToRt[wrapperAddress] = rtAddress;

        // Calculate distributions
        uint256 premineRt = (amount * CREATOR_PREMINE_BPS) / BPS_DENOMINATOR;
        uint256 dexReserveRt = (amount * 20) / 100;
        uint256 curveSupplyRt = amount - dexReserveRt - premineRt;
        uint256 curveSupplyWrapped = curveSupplyRt * WRAP_PER_RT;

        // Initialize bonding curve
        bondingCurves[wrapperAddress] = BondingCurve({
            basePrice: basePrice,
            priceIncrement: priceIncrement,
            currentSupply: curveSupplyWrapped,
            reserveBalance: 0,
            isActive: true
        });

        // Store launched token info
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

        emit TokenLaunched(rtAddress, wrapperAddress, creator, amount, block.timestamp);
        return wrapperAddress;
    }

    /**
     * @notice Launches a new token by locking RT and creating a wrapper token
     * @param rtAddress Address of the Royalty Token to lock
     * @param amount Amount of RT to lock (must be 10 RT or more)
     * @param name Name for the wrapper token
     * @param symbol Symbol for the wrapper token
     * @param basePrice Base price for the bonding curve (in wei)
     * @param priceIncrement Price increment per token unit (in wei)
     * @dev Validates minimum 10 RT listing requirement
     * @dev Locks RT in this contract (acts as vault)
     * @dev Mints wrapper tokens 1:1 with locked RT
     * @dev Initializes bonding curve
     */
    function launchToken(
        address rtAddress,
        uint256 amount,
        string calldata name,
        string calldata symbol,
        uint256 basePrice,
        uint256 priceIncrement
    ) external nonReentrant whenNotPaused {
        if (rtAddress == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (basePrice == 0 || basePrice > MAX_BASE_PRICE) revert InvalidPrice();
        if (priceIncrement == 0 || priceIncrement > MAX_PRICE_INCREMENT) revert InvalidPrice();
        if (rtToWrapper[rtAddress] != address(0)) revert TokenAlreadyLaunched();

        IERC20 rt = IERC20(rtAddress);

        uint256 userBalance = rt.balanceOf(msg.sender);

        // Validate minimum fixed listing amount (10 RT)
        if (amount < MIN_LISTING_AMOUNT) revert MinListingRequired();
        if (amount > userBalance) revert InsufficientBalance();

        // Transfer RT first
        rt.safeTransferFrom(msg.sender, address(this), amount);

        // Use core helper for common logic
        address wrapperAddress = _launchCore(rtAddress, amount, name, symbol, basePrice, priceIncrement, msg.sender);

        // Mint total supply and transfer premine
        uint256 totalWrapped = amount * WRAP_PER_RT;
        uint256 premineWrapped = (amount * CREATOR_PREMINE_BPS * WRAP_PER_RT) / BPS_DENOMINATOR;
        
        SovryToken(wrapperAddress).mint(address(this), totalWrapped);
        if (premineWrapped > 0) {
            creatorPremineLocked[wrapperAddress] = premineWrapped;
            creatorPremineUnlockTime[wrapperAddress] = block.timestamp + 7 days;
        }
    }

    function claimCreatorPremine(address wrapperToken) external nonReentrant whenNotPaused {
        LaunchedToken storage token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) revert UnknownToken();
        if (msg.sender != token.creator) revert NotAuthorized();

        uint256 amount = creatorPremineLocked[wrapperToken];
        if (amount == 0) revert InvalidAmount();
        if (block.timestamp < creatorPremineUnlockTime[wrapperToken]) revert PremineLocked();

        creatorPremineLocked[wrapperToken] = 0;
        IERC20(wrapperToken).safeTransfer(msg.sender, amount);
        emit CreatorPremineClaimed(wrapperToken, msg.sender, amount);
    }

    /**
     * @notice Purchases wrapper tokens from the bonding curve
     * @param wrapperToken Address of the wrapper token to purchase
     * @param amount Amount of wrapper tokens to purchase (must be a multiple of WRAP_UNIT)
     * @param maxEthCost Maximum ETH cost (slippage protection)
     * @param deadline Deadline for the transaction
     * @dev Price increases linearly with supply: price = basePrice + (supply * increment)
     * @dev Calculates total cost including fees
     * @dev Updates bonding curve state
     */
    function buy(
        address wrapperToken,
        uint256 amount,
        uint256 maxEthCost,
        uint256 deadline
    ) external payable nonReentrant whenNotPaused {
        if (wrapperToken == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (msg.value == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert ExpiredDeadline();

        BondingCurve storage curve = bondingCurves[wrapperToken];
        LaunchedToken storage token = launchedTokens[wrapperToken];

        if (!curve.isActive) revert CurveInactive();
        if (token.graduated) revert TokenGraduated();

        // Normalize to whole-wrapper units for bonding curve math
        if (amount % WRAP_UNIT != 0) revert InvalidStep();
        if (curve.currentSupply < amount) revert InsufficientSupply();

        // Calculate base cost (before trading fees) using linear bonding curve formula in wrapper units
        uint256 baseCost = calculateBuyPrice(wrapperToken, amount);

        // Trading fee (1% of baseCost), split between creator and protocol
        uint256 totalFee = (baseCost * TOTAL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 creatorShare = (totalFee * CREATOR_FEE_BPS) / TOTAL_FEE_BPS;
        uint256 protocolShare = totalFee - creatorShare;

        uint256 totalCost = baseCost + totalFee;

        // Slippage protection: user sets maximum ETH/IP they are willing to pay
        if (totalCost > maxEthCost) revert SlippageExceeded();
        if (msg.value < totalCost) revert InsufficientBalance();

        // Update bonding curve state in wrapper units
        curve.currentSupply -= amount;
        curve.reserveBalance += baseCost;
        totalCurveReserves += baseCost;

        // Transfer wrapper tokens to buyer
        IERC20(wrapperToken).safeTransfer(msg.sender, amount);

        // Send creator's share of the fee
        if (creatorShare > 0) {
            (bool creatorOk, ) = payable(token.creator).call{value: creatorShare}("");
            if (!creatorOk) revert TransferFailed();
            emit CreatorFeePaid(wrapperToken, token.creator, creatorShare);
        }

        // Send protocol (treasury) share of the fee
        if (protocolShare > 0) {
            (bool success, ) = payable(treasury).call{value: protocolShare}("");
            if (!success) revert TransferFailed();
            emit FeesCollected(wrapperToken, protocolShare);
        }

        // Refund excess payment
        if (msg.value > totalCost) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: msg.value - totalCost}("");
            if (!refundSuccess) revert TransferFailed();
        }

        emit TokensPurchased(msg.sender, wrapperToken, amount, baseCost);

        // HIGH SEVERITY FIX: Check if token should graduate after buy
        // Graduation should trigger on trading volume, not just on harvest
        _checkGraduation(wrapperToken);
    }

    /**
     * @notice Sells wrapper tokens back to the bonding curve
     * @param wrapperToken Address of the wrapper token to sell
     * @param amount Amount of wrapper tokens to sell (must be a multiple of WRAP_UNIT)
     * @param minEthProceeds Minimum ETH proceeds (slippage protection)
     * @param deadline Deadline for the transaction
     * @dev Price decreases linearly with supply
     * @dev Calculates proceeds after fees
     * @dev Updates bonding curve state
     */
    function sell(
        address wrapperToken,
        uint256 amount,
        uint256 minEthProceeds,
        uint256 deadline
    ) external nonReentrant whenNotPaused {
        if (wrapperToken == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert ExpiredDeadline();

        BondingCurve storage curve = bondingCurves[wrapperToken];
        LaunchedToken storage token = launchedTokens[wrapperToken];

        if (!curve.isActive) revert CurveInactive();
        if (token.graduated) revert TokenGraduated();

        // Transfer wrapper tokens from seller
        IERC20(wrapperToken).safeTransferFrom(msg.sender, address(this), amount);

        // Normalize to whole-wrapper units for bonding curve math
        if (amount % WRAP_UNIT != 0) revert InvalidStep();

        // Calculate base proceeds (before trading fees) using linear bonding curve formula in wrapper units
        uint256 baseProceeds = calculateSellPrice(wrapperToken, amount);
        if (address(this).balance < baseProceeds) revert InsufficientReserves();

        // Trading fee (1% of baseProceeds), split between creator and protocol
        uint256 totalFee = (baseProceeds * TOTAL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 creatorShare = (totalFee * CREATOR_FEE_BPS) / TOTAL_FEE_BPS;
        uint256 protocolShare = totalFee - creatorShare;

        uint256 netProceeds = baseProceeds - totalFee;

        // Slippage protection: user sets minimum ETH/IP they are willing to receive
        if (netProceeds < minEthProceeds) revert SlippageExceeded();

        // Update bonding curve state in wrapper units
        curve.currentSupply += amount;
        curve.reserveBalance -= baseProceeds;
        totalCurveReserves -= baseProceeds;

        // Send proceeds to seller
        (bool success, ) = payable(msg.sender).call{value: netProceeds}("");
        if (!success) revert TransferFailed();

        // Send creator's share of the fee
        if (creatorShare > 0) {
            (bool creatorOk, ) = payable(token.creator).call{value: creatorShare}("");
            if (!creatorOk) revert TransferFailed();
            emit CreatorFeePaid(wrapperToken, token.creator, creatorShare);
        }

        // Send protocol (treasury) share of the fee
        if (protocolShare > 0) {
            (bool feeSuccess, ) = payable(treasury).call{value: protocolShare}("");
            if (!feeSuccess) revert TransferFailed();
            emit FeesCollected(wrapperToken, protocolShare);
        }

        emit TokensSold(msg.sender, wrapperToken, amount, netProceeds);
    }

    /**
     * @notice Applies already-claimed royalties (held as WIP by this contract) to the bonding curve pool
     * @param wrapperToken Address of the wrapper token whose pool should be pumped
     * @dev Consumes all WIP currently held by the launchpad, unwraps it to native IP,
     *      and injects the resulting amount into the bonding curve or buyback flow.
     *      Story Protocol royalty claiming happens off-chain via the SDK and IP Account,
     *      then WIP is transferred to this contract before calling harvest.
     */
    function harvest(address wrapperToken) external nonReentrant whenNotPaused {
        if (wrapperToken == address(0)) revert InvalidAddress();
        LaunchedToken storage token = launchedTokens[wrapperToken];
        if (token.wrapperAddress == address(0)) revert UnknownToken();

        // Check authorization
        address harvester = tokenHarvesters[wrapperToken];

        bool isAuthorized = (
            msg.sender == token.creator ||
            msg.sender == harvester ||
            msg.sender == owner()
        );

        if (!isAuthorized) revert NotAuthorized();

        BondingCurve storage curve = bondingCurves[wrapperToken];

        // Use all WIP that has already been sent to the launchpad contract
        uint256 wipBalance = wipToken != address(0)
            ? IERC20(wipToken).balanceOf(address(this))
            : 0;

        if (wipBalance == 0) revert NoRoyalties();

        uint256 nativeBefore = address(this).balance;

        // Unwrap WIP into native IP
        IWrappedNative(wipToken).withdraw(wipBalance);

        uint256 nativeAfter = address(this).balance;
        uint256 claimedAmount = nativeAfter > nativeBefore
            ? nativeAfter - nativeBefore
            : 0;

        if (claimedAmount == 0) revert NoRoyalties();

        // GRIEFING FIX: Require minimum royalty amount to prevent dust attacks
        // Ensures only meaningful harvests update the timestamp
        if (claimedAmount < 0.001 ether) revert RoyaltyTooSmall();

        token.totalRoyaltiesHarvested += claimedAmount;

        emit RoyaltiesHarvested(wrapperToken, claimedAmount);

        // Distribute royalties to bonding curve pool
        if (!token.graduated && curve.isActive) {
            _applyRoyaltiesToBondingCurve(wrapperToken, claimedAmount);
        } else {
            // If the token has graduated, use royalties for buyback-and-burn on PiperX
            // This benefits all token holders by reducing supply
            _buybackAndBurn(wrapperToken, claimedAmount);
        }
    }

    /**
     * @notice Internal helper to inject royalties as a bonding curve buyback before graduation
     * @dev Treats claimedAmount as WIP spent along the linear bonding curve to "buy" wrapper
     *      tokens into the burn address, reducing currentSupply and increasing reserveBalance.
     */
    function _applyRoyaltiesToBondingCurve(
        address wrapperToken,
        uint256 claimedAmount
    ) internal {
        LaunchedToken storage token = launchedTokens[wrapperToken];
        BondingCurve storage curve = bondingCurves[wrapperToken];

        // Safety: if curve is not active or token already graduated, fall back to simple injection
        if (token.graduated || !curve.isActive) {
            curve.reserveBalance += claimedAmount;
            totalCurveReserves += claimedAmount;
            emit ReservesIncreased(wrapperToken, curve.reserveBalance);
            return;
        }

        uint256 supply = curve.currentSupply;

        // If there is no inventory left on the curve, just inject to reserves
        if (supply < WRAP_UNIT) {
            curve.reserveBalance += claimedAmount;
            totalCurveReserves += claimedAmount;
            emit ReservesIncreased(wrapperToken, curve.reserveBalance);
            _checkGraduation(wrapperToken);
            return;
        }

        uint256 initialCurveSupply = token.initialCurveSupply;
        uint256 soldRaw = initialCurveSupply > supply
            ? (initialCurveSupply - supply)
            : 0;
        uint256 soldUnits = soldRaw / WRAP_UNIT;

        uint256 maxUnits = supply / WRAP_UNIT;
        if (maxUnits == 0) {
            // Defensive: should be covered by supply < WRAP_UNIT above
            curve.reserveBalance += claimedAmount;
            totalCurveReserves += claimedAmount;
            emit ReservesIncreased(wrapperToken, curve.reserveBalance);
            _checkGraduation(wrapperToken);
            return;
        }

        uint256 basePrice = curve.basePrice;
        uint256 priceIncrement = curve.priceIncrement;

        uint256 unitsToBuy;

        if (priceIncrement == 0) {
            // Flat price curve: spend royalties at current spot price
            uint256 currentPricePerUnit = basePrice;
            if (currentPricePerUnit == 0) {
                curve.reserveBalance += claimedAmount;
                totalCurveReserves += claimedAmount;
                emit ReservesIncreased(wrapperToken, curve.reserveBalance);
                _checkGraduation(wrapperToken);
                return;
            }

            unitsToBuy = claimedAmount / currentPricePerUnit;
        } else {
            // Solve quadratic cost function:
            // cost(x) = (basePrice + priceIncrement * soldUnits) * x + 0.5 * priceIncrement * x^2
            // We approximate x from claimedAmount and clamp to inventory.
            uint256 B = basePrice + (priceIncrement * soldUnits);

            // Discriminant: B^2 + 2 * priceIncrement * claimedAmount
            uint256 twoAC = 2 * priceIncrement * claimedAmount;
            uint256 D = (B * B) + twoAC;
            uint256 sqrtD = Math.sqrt(D);

            if (sqrtD <= B) {
                // Royalties too small to move the curve by even 1 whole unit
                curve.reserveBalance += claimedAmount;
                totalCurveReserves += claimedAmount;
                emit ReservesIncreased(wrapperToken, curve.reserveBalance);
                _checkGraduation(wrapperToken);
                return;
            }

            unitsToBuy = (sqrtD - B) / priceIncrement;
        }

        if (unitsToBuy > maxUnits) {
            unitsToBuy = maxUnits;
        }

        if (unitsToBuy == 0) {
            // Fallback: treat royalties as pure reserve injection
            curve.reserveBalance += claimedAmount;
            totalCurveReserves += claimedAmount;
            emit ReservesIncreased(wrapperToken, curve.reserveBalance);
            _checkGraduation(wrapperToken);
            return;
        }

        uint256 amount = unitsToBuy * WRAP_UNIT;

        // Update bonding curve state as if the curve sold `amount` tokens for claimedAmount WIP
        curve.currentSupply -= amount;
        curve.reserveBalance += claimedAmount;
        totalCurveReserves += claimedAmount;

        // Burn the purchased wrapper tokens from the launchpad's inventory
        IERC20(wrapperToken).safeTransfer(BURN_ADDRESS, amount);

        emit BuybackAndBurn(wrapperToken, claimedAmount, amount);
        emit ReservesIncreased(wrapperToken, curve.reserveBalance);

        // Check if the new, higher market cap meets graduation conditions
        _checkGraduation(wrapperToken);
    }

    function _buybackAndBurn(address wrapperToken, uint256 wipAmount) internal {
        if (piperXRouter == address(0)) revert InvalidAddress();

        // Aggregate freshly claimed royalties with any previously pending buyback amount
        uint256 totalToSpend = wipAmount + pendingBuybacks[wrapperToken];
        if (totalToSpend == 0) revert InvalidAmount();

        IPiperXRouter router = IPiperXRouter(piperXRouter);

        // Ensure there is a DEX pool before attempting a swap; if not, keep funds pending
        address factory = router.factory();
        address pair = IPiperXFactory(factory).getPair(wipToken, wrapperToken);

        if (pair == address(0)) {
            pendingBuybacks[wrapperToken] = totalToSpend;
            emit BuybackFailed(wrapperToken, totalToSpend);
            return;
        }

        address[] memory path = new address[](2);
        path[0] = wipToken;
        path[1] = wrapperToken;

        address burnAddress = BURN_ADDRESS;

        // Clear pending amount optimistically; if the swap fails we will restore it
        pendingBuybacks[wrapperToken] = 0;

        try
            router.swapExactETHForTokens{value: totalToSpend}(
                1, // Minimal amount out; additional slippage controls can be handled off-chain
                path,
                burnAddress,
                block.timestamp + 300 // Shorter deadline to reduce MEV window
            )
        returns (uint256[] memory amounts) {
            uint256 wrapperBought = amounts[amounts.length - 1];
            emit BuybackAndBurn(wrapperToken, totalToSpend, wrapperBought);
        } catch {
            // If the swap cannot be executed (e.g., low liquidity, price movement), keep funds pending
            pendingBuybacks[wrapperToken] = totalToSpend;
            emit BuybackFailed(wrapperToken, totalToSpend);
        }
    }

    /**
     * @notice Internal function to graduate a token to DEX
     * @param wrapperToken Address of the wrapper token to graduate
     * @dev Migrates all liquidity from bonding curve to PiperX V2
     * @dev Creates liquidity pool and burns LP tokens
     * @dev Disables bonding curve trading
     * @dev Handles pre-existing pairs with dynamic slippage to prevent griefing
     */
    function _graduate(address wrapperToken) internal {
        LaunchedToken storage token = launchedTokens[wrapperToken];
        BondingCurve storage curve = bondingCurves[wrapperToken];

        require(!token.graduated, "Already graduated");
        require(curve.isActive, "Curve not active");

        // Mark as graduated
        token.graduated = true;
        curve.isActive = false;

        // Get all available liquidity
        // Native side: all ETH accumulated in the bonding curve reserve
        uint256 nativeLiquidity = curve.reserveBalance;
        if (nativeLiquidity > 0) {
            totalCurveReserves -= nativeLiquidity;
            curve.reserveBalance = 0;
        }

        // Token side: use reserved DEX allocation (in RT) plus any remaining
        // unsold bonding-curve inventory (currentSupply in wrapper units).
        uint256 dexReserveWrapped = token.dexReserve * WRAP_PER_RT;
        uint256 tokenLiquidity = dexReserveWrapped + curve.currentSupply;

        require(nativeLiquidity > 0 && tokenLiquidity > 0, "No liquidity to migrate");

        // CRITICAL FIX: Prevent 50% price crash on graduation via price alignment
        // Calculate the spot price at graduation to align Uniswap listing price
        uint256 initialCurveSupply = token.initialCurveSupply;
        uint256 soldRaw = initialCurveSupply > curve.currentSupply
            ? (initialCurveSupply - curve.currentSupply)
            : 0;
        uint256 soldUnits = soldRaw / WRAP_UNIT;

        // Spot price = basePrice + (soldUnits * priceIncrement)
        uint256 spotPrice = curve.basePrice + Math.mulDiv(curve.priceIncrement, soldUnits, 1);

        // Calculate required ETH to maintain spot price on Uniswap
        // Required ETH = spotPrice * tokenLiquidity / WRAP_UNIT
        uint256 requiredETH = Math.mulDiv(spotPrice, tokenLiquidity, WRAP_UNIT);

        // AUTO-BALANCE FIX: Adjust tokenLiquidity if ETH insufficient
        // Instead of reverting, we reduce token liquidity to match available ETH
        // This maintains listing price while burning excess tokens (deflationary = good for holders)
        if (requiredETH > nativeLiquidity) {
            // Calculate adjusted token liquidity: (AvailableETH * WRAP_UNIT) / SpotPrice
            uint256 newTokenLiquidity = Math.mulDiv(nativeLiquidity, WRAP_UNIT, spotPrice);
            
            // Calculate excess tokens that won't be paired with ETH
            uint256 excessTokens = tokenLiquidity - newTokenLiquidity;
            
            // Burn excess tokens to maintain price and reduce supply (deflationary)
            IERC20(wrapperToken).safeTransfer(BURN_ADDRESS, excessTokens);
            
            // Update variables for addLiquidity - now perfectly balanced
            tokenLiquidity = newTokenLiquidity;
            requiredETH = nativeLiquidity; // Use all available ETH
        }

        // Calculate excess ETH (virtual liquidity profit)
        uint256 excessETH = nativeLiquidity - requiredETH;

        IPiperXRouter router = IPiperXRouter(piperXRouter);
        address factory = router.factory();
        address weth = router.WETH();
        address poolAddress = IPiperXFactory(factory).getPair(wrapperToken, weth);

        // GRIEFING FIX: Check if pair already exists (attacker may have pre-created it)
        bool pairExists = poolAddress != address(0);

        // Calculate slippage based on whether pair exists
        uint256 minTokenLiquidity;
        uint256 minNativeLiquidity;

        if (pairExists) {
            // Pair exists: use more aggressive slippage (50% instead of 95%)
            // This allows graduation even if pair was manipulated by attacker
            // The 50% minimum ensures we still get reasonable liquidity ratios
            minTokenLiquidity = (tokenLiquidity * 5000) / BPS_DENOMINATOR; // 50%
            minNativeLiquidity = (requiredETH * 5000) / BPS_DENOMINATOR; // 50% of required ETH
        } else {
            // Pair doesn't exist: use normal slippage protection (95%)
            minTokenLiquidity = (tokenLiquidity * DEX_LP_MIN_BPS) / BPS_DENOMINATOR;
            minNativeLiquidity = (requiredETH * DEX_LP_MIN_BPS) / BPS_DENOMINATOR;
        }

        // Approve router to pull wrapper tokens
        IERC20(wrapperToken).forceApprove(piperXRouter, tokenLiquidity);

        // Add liquidity to PiperX V2 Router with ALIGNED PRICE
        // Use only the required ETH to maintain spot price (not all accumulated ETH)
        // LP tokens are sent to burn address to lock liquidity permanently
        try router.addLiquidityETH{value: requiredETH}(
            wrapperToken,
            tokenLiquidity,
            minTokenLiquidity,
            minNativeLiquidity,
            BURN_ADDRESS, // Burn LP tokens
            block.timestamp + 300
        ) {
            // Success - liquidity added with aligned price
            // Excess ETH is now available for buyback-and-burn
            if (excessETH > 0) {
                _buybackAndBurn(wrapperToken, excessETH);
            }
        } catch {
            // If addLiquidity fails even with relaxed slippage, try with even lower minimums
            // This is a last resort to prevent permanent graduation lock
            try router.addLiquidityETH{value: requiredETH}(
                wrapperToken,
                tokenLiquidity,
                1, // Minimal token amount
                1, // Minimal native amount
                BURN_ADDRESS,
                block.timestamp + 300
            ) {
                // Success with minimal slippage
                // Excess ETH is now available for buyback-and-burn
                if (excessETH > 0) {
                    _buybackAndBurn(wrapperToken, excessETH);
                }
            } catch {
                // If even minimal slippage fails, revert graduation
                // This prevents liquidity from being stuck
                revert("Graduation failed: cannot add liquidity to DEX");
            }
        }

        // DECENTRALIZATION: Renounce ownership to make token trustless
        // After graduation, the wrapper token is fully decentralized
        // No one can mint new tokens or modify the token contract
        SovryToken(wrapperToken).renounceOwnership();
        emit OwnershipRenounced(wrapperToken);

        emit Graduated(wrapperToken, requiredETH, poolAddress);
    }

    /**
     * @notice Internal function to check if token should graduate
     * @param wrapperToken Address of the wrapper token to check
     * @dev Checks market cap threshold and time delay
     */
    function _checkGraduation(address wrapperToken) internal {
        LaunchedToken storage token = launchedTokens[wrapperToken];
        BondingCurve storage curve = bondingCurves[wrapperToken];

        // Skip if already graduated or not active
        if (token.graduated || !curve.isActive) return;

        // Check if market cap threshold is met
        uint256 marketCap = getMarketCap(wrapperToken);
        if (marketCap >= graduationThreshold) {
            // Check time delay (15 minutes after launch)
            if (block.timestamp >= token.launchTime + GRADUATION_DELAY) {
                _graduate(wrapperToken);
            }
        }
    }

    /**
     * @notice Calculates the total cost to buy a given amount of tokens
     * @param wrapperToken Address of the wrapper token
     * @param amount Amount of tokens to buy
     * @return Total cost in native token (including fees)
     * @dev Uses linear bonding curve: price = basePrice + (supply * increment)
     * @dev Integrates price function over the purchase amount
     */
    function calculateBuyPrice(
        address wrapperToken,
        uint256 amount
    ) public view returns (uint256) {
        BondingCurve memory curve = bondingCurves[wrapperToken];
        if (!curve.isActive) revert CurveInactive();
        if (amount == 0) revert InvalidAmount();
        if (curve.currentSupply < amount) revert InsufficientSupply();
        if (amount % WRAP_UNIT != 0) revert InvalidStep();

        LaunchedToken memory token = launchedTokens[wrapperToken];
        
        return BondingCurveLib.calculateBuyPrice(
            curve.basePrice,
            curve.priceIncrement,
            curve.currentSupply,
            token.initialCurveSupply,
            amount,
            WRAP_UNIT
        );
    }

    /**
     * @notice Calculates the total proceeds from selling a given amount of tokens
     * @param wrapperToken Address of the wrapper token
     * @param amount Amount of tokens to sell
     * @return Total proceeds in native token (before fees)
     */
    function calculateSellPrice(
        address wrapperToken,
        uint256 amount
    ) public view returns (uint256) {
        BondingCurve memory curve = bondingCurves[wrapperToken];
        if (!curve.isActive) revert CurveInactive();
        if (amount == 0) revert InvalidAmount();
        if (amount % WRAP_UNIT != 0) revert InvalidStep();

        LaunchedToken memory token = launchedTokens[wrapperToken];
        uint256 soldRaw = token.initialCurveSupply > curve.currentSupply
            ? (token.initialCurveSupply - curve.currentSupply)
            : 0;
        if (soldRaw < amount) revert InsufficientSupply();

        return BondingCurveLib.calculateSellPrice(
            curve.basePrice,
            curve.priceIncrement,
            curve.currentSupply,
            token.initialCurveSupply,
            amount,
            WRAP_UNIT
        );
    }

    /**
     * @notice Gets the current market cap of a token
     * @param wrapperToken Address of the wrapper token
     * @return Market cap in native token
     * @dev Market cap = current price * total supply
     */
    function getMarketCap(address wrapperToken) public view returns (uint256) {
        BondingCurve memory curve = bondingCurves[wrapperToken];
        if (!curve.isActive) return 0;

        LaunchedToken memory token = launchedTokens[wrapperToken];

        // Total wrapper supply in whole-wrapper units using actual ERC20 totalSupply
        uint256 totalWrapped = IERC20(wrapperToken).totalSupply();
        uint256 totalSupplyUnits = totalWrapped / WRAP_UNIT;

        // Current price based on circulating supply (tokens sold) in whole-wrapper units
        uint256 initialCurveSupply = token.initialCurveSupply;
        uint256 soldRaw = initialCurveSupply > curve.currentSupply
            ? (initialCurveSupply - curve.currentSupply)
            : 0;
        uint256 soldUnits = soldRaw / WRAP_UNIT;

        uint256 currentPrice = curve.basePrice + (soldUnits * curve.priceIncrement);

        return currentPrice * totalSupplyUnits;
    }

    function getTokenState(
        address wrapperToken
    ) external view returns (TokenState memory) {
        LaunchedToken memory token = launchedTokens[wrapperToken];
        BondingCurve memory curve = bondingCurves[wrapperToken];

        uint256 currentPrice;
        uint256 marketCap;
        bool canGraduate;
        uint256 secondsSinceLaunch;
        uint256 secondsToGraduationDelay;

        if (token.wrapperAddress != address(0)) {
            if (token.launchTime > 0 && block.timestamp >= token.launchTime) {
                secondsSinceLaunch = block.timestamp - token.launchTime;

                if (secondsSinceLaunch >= GRADUATION_DELAY) {
                    secondsToGraduationDelay = 0;
                } else {
                    secondsToGraduationDelay = GRADUATION_DELAY - secondsSinceLaunch;
                }
            }

            if (curve.isActive) {
                uint256 initialCurveSupply = token.initialCurveSupply;
                uint256 soldRaw = initialCurveSupply > curve.currentSupply
                    ? (initialCurveSupply - curve.currentSupply)
                    : 0;
                uint256 soldUnits = soldRaw / WRAP_UNIT;
                currentPrice = curve.basePrice + (soldUnits * curve.priceIncrement);
            }

            marketCap = getMarketCap(wrapperToken);

            if (
                !token.graduated &&
                curve.isActive &&
                marketCap >= graduationThreshold &&
                secondsSinceLaunch >= GRADUATION_DELAY
            ) {
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
            secondsToGraduationDelay: secondsToGraduationDelay
        });
    }

    /**
     * @notice Gets current price for buying 1 token
     * @param wrapperToken Address of the wrapper token
     * @return Price in native token
     */
    function getCurrentPrice(address wrapperToken) external view returns (uint256) {
        BondingCurve memory curve = bondingCurves[wrapperToken];
        if (!curve.isActive) return 0;
        LaunchedToken memory token = launchedTokens[wrapperToken];
        uint256 initialCurveSupply = token.initialCurveSupply;
        uint256 soldRaw = initialCurveSupply > curve.currentSupply
            ? (initialCurveSupply - curve.currentSupply)
            : 0;

        uint256 soldUnits = soldRaw / WRAP_UNIT;

        return curve.basePrice + (soldUnits * curve.priceIncrement);
    }

    /**
     * @notice Updates treasury address
     * @param newTreasury New treasury address
     * @dev Only owner can call
     */
    function updateTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury");
        treasury = newTreasury;
    }

    /**
     * @notice Updates graduation threshold
     * @param newThreshold New graduation threshold in wei
     * @dev Only owner can call
     */
    function updateGraduationThreshold(uint256 newThreshold) external onlyOwner {
        require(newThreshold > 0, "Invalid threshold");
        graduationThreshold = newThreshold;
        emit GraduationThresholdUpdated(newThreshold);
    }

    /**
     * @notice Updates PiperX router address
     * @param newRouter New router address
     * @dev Only owner can call
     */
    function updatePiperXRouter(address newRouter) external onlyOwner {
        require(newRouter != address(0), "Invalid router");
        piperXRouter = newRouter;
    }

    /**
     * @notice Emergency withdraw function for owner
     * @param token Address of token to withdraw (address(0) for native token)
     * @param to Address to send tokens to
     * @param amount Amount to withdraw (0 for all)
     * @dev Only owner can call
     */
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(to != address(0), "Invalid recipient");

        if (token == address(0)) {
            // Withdraw native token, but never touch bonding curve reserves
            require(
                address(this).balance >= totalCurveReserves,
                "Inconsistent reserves"
            );

            uint256 freeBalance = address(this).balance - totalCurveReserves;
            require(freeBalance > 0, "No free native balance");

            uint256 withdrawAmount = amount == 0 ? freeBalance : amount;
            require(withdrawAmount <= freeBalance, "Amount exceeds free balance");

            (bool success, ) = payable(to).call{value: withdrawAmount}("");
            require(success, "Transfer failed");
        } else {
            // Withdraw ERC20 token
            IERC20 erc20 = IERC20(token);
            // Disallow withdrawing wrapper tokens created by this launchpad
            if (launchedTokens[token].wrapperAddress != address(0)) {
                revert("Cannot withdraw wrapper tokens");
            }

            uint256 withdrawAmount = amount == 0 ? erc20.balanceOf(address(this)) : amount;
            erc20.safeTransfer(to, withdrawAmount);
        }
    }

    /**
     * @notice Pauses the contract
     * @dev Only owner can call
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpauses the contract
     * @dev Only owner can call
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Receives native token (for bonding curve purchases)
     */
    receive() external payable {
        // Contract can receive native token for bonding curve operations
    }
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./SovryToken.sol";

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
 * @dev Used for adding liquidity when tokens graduate
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
}

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

    /// @notice Fee percentage in basis points (50 = 0.5%)
    uint256 public constant FEE_BPS = 50;

    /// @notice Minimum listing percentage (10%)
    uint256 public constant MIN_LISTING_PERCENT = 10;

    /// @notice Maximum listing percentage (100%)
    uint256 public constant MAX_LISTING_PERCENT = 100;

    /// @notice Basis points denominator (10000 = 100%)
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Default graduation threshold in wei (e.g., $69,000 worth of native token)
    uint256 public graduationThreshold;

    /// @notice PiperX V2 Router address for liquidity migration
    address public piperXRouter;

    /// @notice Story Protocol Royalty Workflows contract address
    address public royaltyWorkflows;

    /// @notice WIP token address (native token on Story Protocol)
    address public wipToken;

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
     * @param totalLocked Total amount of RT locked in the vault
     * @param graduated Whether the token has graduated to DEX
     * @param totalRoyaltiesHarvested Total royalties harvested for this token
     * @param vaultAddress Address of the vault holding locked RT (this contract)
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
    }

    /// @notice Mapping from wrapper token address to bonding curve data
    mapping(address => BondingCurve) public bondingCurves;

    /// @notice Mapping from wrapper token address to launched token info
    mapping(address => LaunchedToken) public launchedTokens;

    /// @notice Mapping from RT address to wrapper token address
    mapping(address => address) public rtToWrapper;

    /// @notice Mapping from wrapper token to RT address
    mapping(address => address) public wrapperToRt;

    /// @notice Mapping from user address to wrapper token to locked amount
    mapping(address => mapping(address => uint256)) public userLockedAmounts;

    /// @notice Mapping from wrapper token to graduation status
    mapping(address => bool) public isGraduated;

    /// @notice Array of all launched wrapper token addresses
    address[] public allLaunchedTokens;

    /// @notice Event emitted when a token is launched
    /// @param rt Address of the royalty token
    /// @param wrapper Address of the wrapper token
    /// @param creator Address that launched the token
    /// @param amount Amount of RT locked
    /// @param launchTime Timestamp of launch
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

    /// @notice Event emitted when floor price is updated after royalty injection
    /// @param wrapperToken Address of the wrapper token
    /// @param newFloor New floor price
    event FloorPriceUpdated(
        address indexed wrapperToken,
        uint256 newFloor
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

    /// @notice Event emitted when additional RT is locked
    /// @param wrapperToken Address of the wrapper token
    /// @param user Address that locked additional RT
    /// @param amount Additional amount locked
    event AdditionalRTLocked(
        address indexed wrapperToken,
        address indexed user,
        uint256 amount
    );

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
        require(_treasury != address(0), "Invalid treasury");
        require(_piperXRouter != address(0), "Invalid router");
        require(_royaltyWorkflows != address(0), "Invalid royalty workflows");
        require(_wipToken != address(0), "Invalid WIP token");
        require(_graduationThreshold > 0, "Invalid threshold");

        treasury = _treasury;
        piperXRouter = _piperXRouter;
        royaltyWorkflows = _royaltyWorkflows;
        wipToken = _wipToken;
        graduationThreshold = _graduationThreshold;
    }

    /**
     * @notice Launches a new token by locking RT and creating a wrapper token
     * @param rtAddress Address of the Royalty Token to lock
     * @param amount Amount of RT to lock (must be 10-100% of user's balance)
     * @param name Name for the wrapper token
     * @param symbol Symbol for the wrapper token
     * @param basePrice Base price for the bonding curve (in wei)
     * @param priceIncrement Price increment per token unit (in wei)
     * @dev Validates minimum 10% listing requirement
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
        require(rtAddress != address(0), "Invalid RT address");
        require(amount > 0, "Amount must be greater than zero");
        require(basePrice > 0, "Base price must be greater than zero");
        require(priceIncrement > 0, "Price increment must be greater than zero");
        require(rtToWrapper[rtAddress] == address(0), "Token already launched");

        IERC20 rt = IERC20(rtAddress);
        uint256 userBalance = rt.balanceOf(msg.sender);

        // Validate minimum 10% listing requirement
        require(amount >= (userBalance * MIN_LISTING_PERCENT) / 100, "Minimum 10% required");
        require(amount <= userBalance, "Insufficient balance");

        // Transfer RT from user to this contract (vault)
        rt.safeTransferFrom(msg.sender, address(this), amount);

        // Deploy wrapper token with this contract as owner (for minting)
        SovryToken wrapper = new SovryToken(name, symbol, rtAddress, address(this));
        address wrapperAddress = address(wrapper);

        // Mint wrapper tokens 1:1 with locked RT to this contract
        // These will be sold through the bonding curve
        wrapper.mint(address(this), amount);

        // Initialize bonding curve
        bondingCurves[wrapperAddress] = BondingCurve({
            basePrice: basePrice,
            priceIncrement: priceIncrement,
            currentSupply: amount,
            reserveBalance: 0,
            isActive: true
        });

        // Store launched token info
        launchedTokens[wrapperAddress] = LaunchedToken({
            rtAddress: rtAddress,
            wrapperAddress: wrapperAddress,
            creator: msg.sender,
            launchTime: block.timestamp,
            totalLocked: amount,
            graduated: false,
            totalRoyaltiesHarvested: 0,
            vaultAddress: address(this)
        });

        // Update mappings
        rtToWrapper[rtAddress] = wrapperAddress;
        wrapperToRt[wrapperAddress] = rtAddress;
        userLockedAmounts[msg.sender][wrapperAddress] = amount;
        allLaunchedTokens.push(wrapperAddress);

        emit TokenLaunched(rtAddress, wrapperAddress, msg.sender, amount, block.timestamp);
    }

    /**
     * @notice Allows users to lock additional RT for an already launched token
     * @param wrapperToken Address of the wrapper token
     * @param amount Additional amount of RT to lock
     * @dev Mints additional wrapper tokens 1:1
     * @dev Increases bonding curve supply
     */
    function lockAdditionalRT(
        address wrapperToken,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(wrapperToken != address(0), "Invalid wrapper token");
        require(amount > 0, "Amount must be greater than zero");
        
        LaunchedToken storage token = launchedTokens[wrapperToken];
        require(token.wrapperAddress != address(0), "Token not launched");
        require(!token.graduated, "Token already graduated");

        address rtAddress = token.rtAddress;
        IERC20 rt = IERC20(rtAddress);

        // Transfer RT from user
        rt.safeTransferFrom(msg.sender, address(this), amount);

        // Mint wrapper tokens 1:1
        SovryToken(wrapperToken).mint(address(this), amount);

        // Update state
        token.totalLocked += amount;
        userLockedAmounts[msg.sender][wrapperToken] += amount;
        bondingCurves[wrapperToken].currentSupply += amount;

        emit AdditionalRTLocked(wrapperToken, msg.sender, amount);
    }

    /**
     * @notice Purchases wrapper tokens from the bonding curve
     * @param wrapperToken Address of the wrapper token to purchase
     * @param amount Amount of wrapper tokens to purchase
     * @dev Price increases linearly with supply: price = basePrice + (supply * increment)
     * @dev Calculates total cost including fees
     * @dev Updates bonding curve state
     */
    function buy(
        address wrapperToken,
        uint256 amount
    ) external payable nonReentrant whenNotPaused {
        require(wrapperToken != address(0), "Invalid wrapper token");
        require(amount > 0, "Amount must be greater than zero");
        require(msg.value > 0, "Must send native token");

        BondingCurve storage curve = bondingCurves[wrapperToken];
        LaunchedToken storage token = launchedTokens[wrapperToken];

        require(curve.isActive, "Curve not active");
        require(!token.graduated, "Token already graduated");
        require(curve.currentSupply >= amount, "Insufficient supply");

        // Calculate total cost using linear bonding curve formula
        uint256 totalCost = calculateBuyPrice(wrapperToken, amount);
        require(msg.value >= totalCost, "Insufficient payment");

        // Calculate fees (0.5%)
        uint256 feeAmount = (totalCost * FEE_BPS) / BPS_DENOMINATOR;
        uint256 netCost = totalCost - feeAmount;

        // Update bonding curve state
        curve.currentSupply -= amount;
        curve.reserveBalance += netCost;

        // Transfer wrapper tokens to buyer
        IERC20(wrapperToken).safeTransfer(msg.sender, amount);

        // Send fees to treasury
        if (feeAmount > 0) {
            (bool success, ) = payable(treasury).call{value: feeAmount}("");
            require(success, "Fee transfer failed");
            emit FeesCollected(wrapperToken, feeAmount);
        }

        // Refund excess payment
        if (msg.value > totalCost) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: msg.value - totalCost}("");
            require(refundSuccess, "Refund failed");
        }

        emit TokensPurchased(msg.sender, wrapperToken, amount, totalCost);

        // Check graduation condition
        uint256 marketCap = getMarketCap(wrapperToken);
        if (marketCap >= graduationThreshold && !token.graduated) {
            _graduate(wrapperToken);
        }
    }

    /**
     * @notice Sells wrapper tokens back to the bonding curve
     * @param wrapperToken Address of the wrapper token to sell
     * @param amount Amount of wrapper tokens to sell
     * @dev Price decreases linearly with supply
     * @dev Calculates proceeds after fees
     * @dev Updates bonding curve state
     */
    function sell(
        address wrapperToken,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(wrapperToken != address(0), "Invalid wrapper token");
        require(amount > 0, "Amount must be greater than zero");

        BondingCurve storage curve = bondingCurves[wrapperToken];
        LaunchedToken storage token = launchedTokens[wrapperToken];

        require(curve.isActive, "Curve not active");
        require(!token.graduated, "Token already graduated");

        // Transfer wrapper tokens from seller
        IERC20(wrapperToken).safeTransferFrom(msg.sender, address(this), amount);

        // Calculate proceeds using linear bonding curve formula
        uint256 totalProceeds = calculateSellPrice(wrapperToken, amount);
        require(address(this).balance >= totalProceeds, "Insufficient reserves");

        // Calculate fees (0.5%)
        uint256 feeAmount = (totalProceeds * FEE_BPS) / BPS_DENOMINATOR;
        uint256 netProceeds = totalProceeds - feeAmount;

        // Update bonding curve state
        curve.currentSupply += amount;
        curve.reserveBalance -= totalProceeds;

        // Send proceeds to seller
        (bool success, ) = payable(msg.sender).call{value: netProceeds}("");
        require(success, "Transfer failed");

        // Send fees to treasury
        if (feeAmount > 0) {
            (bool feeSuccess, ) = payable(treasury).call{value: feeAmount}("");
            require(feeSuccess, "Fee transfer failed");
            emit FeesCollected(wrapperToken, feeAmount);
        }

        emit TokensSold(msg.sender, wrapperToken, amount, netProceeds);
    }

    /**
     * @notice Harvests royalties from Story Protocol and pumps the bonding curve
     * @param wrapperToken Address of the wrapper token
     * @param ancestorIpId Ancestor IP ID for royalty claiming
     * @param childIpIds Array of child IP IDs
     * @param royaltyPolicies Array of royalty policy addresses
     * @param currencyTokens Array of currency token addresses to claim
     * @dev Claims royalties and injects them into the bonding curve reserve
     * @dev Raises floor price without increasing supply
     */
    function harvestAndPump(
        address wrapperToken,
        address ancestorIpId,
        address[] calldata childIpIds,
        address[] calldata royaltyPolicies,
        address[] calldata currencyTokens
    ) external nonReentrant whenNotPaused {
        require(wrapperToken != address(0), "Invalid wrapper token");
        
        LaunchedToken storage token = launchedTokens[wrapperToken];
        require(token.wrapperAddress != address(0), "Token not launched");
        require(!token.graduated, "Token already graduated");

        BondingCurve storage curve = bondingCurves[wrapperToken];
        require(curve.isActive, "Curve not active");

        // Get balance before claiming
        uint256 balanceBefore = address(this).balance;

        // Claim royalties from Story Protocol
        IRoyaltyWorkflows(royaltyWorkflows).claimAllRevenue(
            ancestorIpId,
            address(this),
            childIpIds,
            royaltyPolicies,
            currencyTokens
        );

        uint256 balanceAfter = address(this).balance;
        require(balanceAfter > balanceBefore, "No royalties claimed");

        uint256 claimedAmount = balanceAfter - balanceBefore;

        // Pump: Inject royalties into bonding curve reserve
        // This increases the reserve without increasing supply, raising the floor price
        uint256 oldReserve = curve.reserveBalance;
        curve.reserveBalance += claimedAmount;
        token.totalRoyaltiesHarvested += claimedAmount;

        emit RoyaltiesHarvested(wrapperToken, claimedAmount);
        emit FloorPriceUpdated(wrapperToken, curve.basePrice + (curve.currentSupply * curve.priceIncrement));

        // Check graduation after pump
        uint256 marketCap = getMarketCap(wrapperToken);
        if (marketCap >= graduationThreshold && !token.graduated) {
            _graduate(wrapperToken);
        }
    }

    /**
     * @notice Internal function to graduate a token to DEX
     * @param wrapperToken Address of the wrapper token to graduate
     * @dev Migrates all liquidity from bonding curve to PiperX V2
     * @dev Creates liquidity pool and burns LP tokens
     * @dev Disables bonding curve trading
     */
    function _graduate(address wrapperToken) internal {
        LaunchedToken storage token = launchedTokens[wrapperToken];
        BondingCurve storage curve = bondingCurves[wrapperToken];

        require(!token.graduated, "Already graduated");
        require(curve.isActive, "Curve not active");

        // Mark as graduated
        token.graduated = true;
        curve.isActive = false;
        isGraduated[wrapperToken] = true;

        // Get all available liquidity
        uint256 nativeLiquidity = curve.reserveBalance;
        uint256 tokenLiquidity = IERC20(wrapperToken).balanceOf(address(this));

        require(nativeLiquidity > 0 && tokenLiquidity > 0, "No liquidity to migrate");

        // Approve router to spend tokens
        IERC20(wrapperToken).safeApprove(piperXRouter, tokenLiquidity);

        // Add liquidity to PiperX V2 Router
        // LP tokens are sent to burn address to lock liquidity permanently
        IPiperXRouter(piperXRouter).addLiquidityETH{value: nativeLiquidity}(
            wrapperToken,
            tokenLiquidity,
            1, // minToken (slippage tolerance)
            1, // minETH (slippage tolerance)
            address(0x000000000000000000000000000000000000dEaD), // Burn LP tokens
            block.timestamp + 600
        );

        // Note: Pool address would need to be retrieved from router or factory
        // For now, we use address(0) as placeholder
        address poolAddress = address(0);

        emit Graduated(wrapperToken, nativeLiquidity, poolAddress);
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
        require(curve.isActive, "Curve not active");
        require(curve.currentSupply >= amount, "Insufficient supply");

        // Linear bonding curve: price = basePrice + (supply * increment)
        // To calculate total cost, we integrate the price function
        // Cost = ∫[from supply to supply-amount] (basePrice + (s * increment)) ds
        // Cost = basePrice * amount + increment * (supply * amount - amount^2 / 2)

        uint256 supply = curve.currentSupply;
        uint256 baseCost = curve.basePrice * amount;
        uint256 incrementCost = curve.priceIncrement * supply * amount - 
                                (curve.priceIncrement * amount * amount) / 2;

        uint256 totalCost = baseCost + incrementCost;
        
        // Add fees
        uint256 feeAmount = (totalCost * FEE_BPS) / BPS_DENOMINATOR;
        return totalCost + feeAmount;
    }

    /**
     * @notice Calculates the total proceeds from selling a given amount of tokens
     * @param wrapperToken Address of the wrapper token
     * @param amount Amount of tokens to sell
     * @return Total proceeds in native token (before fees)
     * @dev Uses linear bonding curve: price = basePrice + (supply * increment)
     * @dev Integrates price function over the sale amount
     */
    function calculateSellPrice(
        address wrapperToken,
        uint256 amount
    ) public view returns (uint256) {
        BondingCurve memory curve = bondingCurves[wrapperToken];
        require(curve.isActive, "Curve not active");

        uint256 supply = curve.currentSupply;
        
        // Calculate price at current supply (before adding back the tokens)
        // Price = basePrice + (supply * increment)
        // To calculate total proceeds, we integrate from supply to supply+amount
        // Proceeds = ∫[from supply to supply+amount] (basePrice + (s * increment)) ds
        // Proceeds = basePrice * amount + increment * (supply * amount + amount^2 / 2)

        uint256 baseProceeds = curve.basePrice * amount;
        uint256 incrementProceeds = curve.priceIncrement * supply * amount + 
                                    (curve.priceIncrement * amount * amount) / 2;

        return baseProceeds + incrementProceeds;
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

        // Current price = basePrice + (currentSupply * priceIncrement)
        uint256 currentPrice = curve.basePrice + (curve.currentSupply * curve.priceIncrement);
        
        // Total supply = original supply (from launchedTokens)
        LaunchedToken memory token = launchedTokens[wrapperToken];
        uint256 totalSupply = token.totalLocked;

        return currentPrice * totalSupply;
    }

    /**
     * @notice Gets comprehensive token information
     * @param wrapperToken Address of the wrapper token
     * @return Token information struct
     */
    function getTokenInfo(
        address wrapperToken
    ) external view returns (LaunchedToken memory) {
        return launchedTokens[wrapperToken];
    }

    /**
     * @notice Gets bonding curve information
     * @param wrapperToken Address of the wrapper token
     * @return Bonding curve struct
     */
    function getBondingCurve(
        address wrapperToken
    ) external view returns (BondingCurve memory) {
        return bondingCurves[wrapperToken];
    }

    /**
     * @notice Gets current price for buying 1 token
     * @param wrapperToken Address of the wrapper token
     * @return Price in native token
     */
    function getCurrentPrice(address wrapperToken) external view returns (uint256) {
        BondingCurve memory curve = bondingCurves[wrapperToken];
        if (!curve.isActive) return 0;
        return curve.basePrice + (curve.currentSupply * curve.priceIncrement);
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
            // Withdraw native token
            uint256 withdrawAmount = amount == 0 ? address(this).balance : amount;
            (bool success, ) = payable(to).call{value: withdrawAmount}("");
            require(success, "Transfer failed");
        } else {
            // Withdraw ERC20 token
            IERC20 erc20 = IERC20(token);
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
     * @notice Gets total number of launched tokens
     * @return Count of launched tokens
     */
    function getLaunchedTokenCount() external view returns (uint256) {
        return allLaunchedTokens.length;
    }

    /**
     * @notice Gets all launched token addresses
     * @return Array of wrapper token addresses
     */
    function getAllLaunchedTokens() external view returns (address[] memory) {
        return allLaunchedTokens;
    }

    /**
     * @notice Receives native token (for bonding curve purchases)
     */
    receive() external payable {
        // Contract can receive native token for bonding curve operations
    }
}

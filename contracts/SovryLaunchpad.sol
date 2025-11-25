// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SovryToken.sol";

interface IExternalRouter {
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);
}

// Generic interface for a revenue source; concrete Story Protocol contracts
// can be wired to this via a thin adapter.
interface IRevenueSource {
    function claimRevenue() external returns (uint256 claimedAmount);
}

// Minimal interface for Story Protocol RoyaltyWorkflows.claimAllRevenue
// See: https://docs.story.foundation/developers/smart-contracts-guide/claim-revenue
interface IRoyaltyWorkflows {
    function claimAllRevenue(
        address ancestorIpId,
        address claimer,
        address[] calldata childIpIds,
        address[] calldata royaltyPolicies,
        address[] calldata currencyTokens
    ) external returns (uint256[] memory amountsClaimed);
}

// Generic Royalty Vault interface (placeholder; adjust to actual Story Protocol ABI if needed)
interface IRoyaltyVault {
    function claimRevenue(address royaltyToken, address snapshotId) external returns (uint256 amountClaimed);
}

contract SovryLaunchpad is ReentrancyGuard, Ownable {
    struct Launch {
        address creator;
        address token;          // Wrapper token (SovryToken)
        address royaltyToken;   // Underlying Royalty Token (RT)
        address royaltyVault;   // Story Protocol Royalty Vault for this IP
        uint256 totalRaised;    // Total Native IP yang terkumpul
        uint256 tokensSold;     // Total Token yang terjual di curve
        bool graduated;         // Status apakah sudah masuk Uniswap
    }

    // Config Bonding Curve (Bisa di-tweak)
    uint256 public constant TARGET_RAISE = 1 ether; // Target 1 $IP untuk lulus
    uint256 public constant TOKEN_SUPPLY = 100_000_000 * 1e18; // Asumsi 100 Juta Unit
    
    // Alokasi: 80% dijual di Curve, 20% untuk Liquidity Pool awal
    uint256 public constant CURVE_SUPPLY = 80_000_000 * 1e18; 
    uint256 public constant POOL_SUPPLY = 20_000_000 * 1e18;

    // Virtual Reserves untuk Matematika Harga (Supaya harga tidak mulai dari 0)
    uint256 public constant VIRTUAL_IP_RESERVE = 0.2 ether; 
    uint256 public constant FEE_BPS = 50; // 0.5% fee (50 / 10000)
    uint256 public constant MAX_TX_BPS = 100; // 1% of curve supply per transaction (anti-sniper)
    
    // External DEX integration (PiperX Uniswap V2 Router + WIP token)
    address public constant PIPERX_ROUTER = 0x674eFAa8C50cBEF923ECe625d3c276B7Bb1c16fB;
    address public constant WIP = 0x1514000000000000000000000000000000000000;
    // Story Protocol RoyaltyWorkflows (Aeneid Testnet)
    address public constant ROYALTY_WORKFLOWS = 0x9515faE61E0c0447C6AC6dEe5628A2097aFE1890;
    
    address public feeTo;
    
    mapping(address => Launch) public launches; // Wrapper Token Address -> Launch Info
    mapping(address => uint256) public curveSupplies; // Wrapper Token Address -> Dynamic curve supply
    mapping(address => address) public underlyingTokens; // Wrapper -> Royalty Token (RT)
    mapping(address => address) public wrapperTokens;    // Royalty Token (RT) -> Wrapper
    mapping(address => address) public royaltyVaults;    // Wrapper -> Royalty Vault
    address[] public allLaunches;

    event Launched(address indexed token, address indexed creator);
    event WrapperDeployed(address indexed royaltyToken, address indexed wrapper, string name, string symbol);
    event Bought(address indexed token, address indexed buyer, uint256 amountIP, uint256 amountTokens);
    event Sold(address indexed token, address indexed seller, uint256 amountTokens, uint256 amountIP);
    event Graduated(address indexed token, address indexed pool, uint256 totalLiquidity);
    event RevenueInjected(address indexed token, uint256 amount);
    event Redeemed(address indexed wrapper, address indexed user, uint256 amount);

    constructor() Ownable(msg.sender) {
        feeTo = 0x8c317fb91a73E2C8D4883DDED3981982F046F733;
    }

    function setFeeTo(address _feeTo) external onlyOwner {
        require(_feeTo != address(0), "Invalid feeTo");
        feeTo = _feeTo;
    }

    /// @notice Set the royalty vault address for a launched wrapper token.
    /// @dev This can be derived off-chain using Story's RoyaltyModule/IP graph.
    function setRoyaltyVault(address wrapperToken, address royaltyVault) external onlyOwner {
        require(launches[wrapperToken].token != address(0), "Unknown launch");
        require(royaltyVault != address(0), "Invalid vault");
        royaltyVaults[wrapperToken] = royaltyVault;
        launches[wrapperToken].royaltyVault = royaltyVault;
    }

    // 1. CREATOR: Launch Token (Tanpa Modal $IP)
    // User locks Royalty Token (RT) and gets a branded wrapper (SovryToken) on the bonding curve.
    function launchToken(
        address royaltyToken,
        uint256 amount,
        string calldata name,
        string calldata symbol
    ) external nonReentrant {
        require(royaltyToken != address(0), "Invalid token");
        require(amount > 0, "Amount 0");

        // Prevent launching the same royalty token multiple times
        require(wrapperTokens[royaltyToken] == address(0), "Already launched");

        // Creator must have approved the royalty token to this contract
        IERC20(royaltyToken).transferFrom(msg.sender, address(this), amount);

        // Deploy a new SovryToken wrapper for this launch. The launchpad becomes owner/minter.
        // Mint initial supply equal to the locked royalty tokens (1:1 peg).
        SovryToken wrapper = new SovryToken(name, symbol, amount, address(this));
        address wrapperAddr = address(wrapper);

        require(launches[wrapperAddr].token == address(0), "Wrapper exists");

        // 80% of wrapper supply is allocated to the bonding curve, 20% reserved for DEX liquidity
        uint256 curveSupply = (amount * 80) / 100;
        curveSupplies[wrapperAddr] = curveSupply;

        launches[wrapperAddr] = Launch({
            creator: msg.sender,
            token: wrapperAddr,
            royaltyToken: royaltyToken,
            royaltyVault: address(0),
            totalRaised: 0,
            tokensSold: 0,
            graduated: false
        });

        underlyingTokens[wrapperAddr] = royaltyToken;
        wrapperTokens[royaltyToken] = wrapperAddr;
        allLaunches.push(wrapperAddr);
        emit WrapperDeployed(royaltyToken, wrapperAddr, name, symbol);
        emit Launched(wrapperAddr, msg.sender);
    }

    // 2. TRADER: Beli Token (Harga naik otomatis)
    // Slippage protection via minTokensOut
    function buy(address token, uint256 minTokensOut) external payable nonReentrant {
        Launch storage l = launches[token];
        require(l.token != address(0), "Token not found");
        require(!l.graduated, "Token already graduated to DEX");
        require(msg.value > 0, "Send IP to buy");

        // Inject any external revenue (royalties) into the curve before trading
        _injectRevenue(token);

        uint256 curveSupply = curveSupplies[token];
        require(curveSupply > 0, "Curve not initialized");

        // Fee split: a portion goes to treasury, the rest goes into the bonding curve
        uint256 feeAmount = (msg.value * FEE_BPS) / 10000;
        uint256 investAmount = msg.value - feeAmount;
        require(investAmount > 0, "Invest amount is zero");

        if (feeAmount > 0) {
            (bool feeSuccess, ) = payable(feeTo).call{value: feeAmount}("");
            require(feeSuccess, "Fee transfer failed");
        }
        
        // Hitung jumlah token yang didapat menggunakan Constant Product Formula (Virtual)
        // (VirtualIP + TotalRaised) * (CurveSupply - TokensSold) = k
        uint256 tokensToBuy = getAmountOut(investAmount, l.totalRaised + VIRTUAL_IP_RESERVE, curveSupply - l.tokensSold);

        require(l.tokensSold + tokensToBuy <= curveSupply, "Not enough tokens left");

        // Anti-sniper: batasi max pembelian per tx di fase bonding curve
        uint256 maxTxAmount = (curveSupply * MAX_TX_BPS) / 10000; // 1% curve supply
        if (maxTxAmount > 0) {
            require(tokensToBuy <= maxTxAmount, "Max tx size exceeded");
        }

        // Slippage protection: pastikan output minimal sesuai toleransi user
        require(tokensToBuy >= minTokensOut, "Slippage too high");

        // Update State (hanya IP yang benar-benar masuk curve yang dihitung)
        l.totalRaised += investAmount;
        l.tokensSold += tokensToBuy;

        // Transfer Token ke Pembeli
        IERC20(token).transfer(msg.sender, tokensToBuy);
        emit Bought(token, msg.sender, investAmount, tokensToBuy);

        // Cek Graduation
        if (l.totalRaised >= TARGET_RAISE) {
            _graduate(token);
        }
    }

    // 3. TRADER: Jual Token (Dapat IP kembali)
    // Slippage protection via minIpOut (minimum IP yang diterima user)
    function sell(address token, uint256 tokenAmount, uint256 minIpOut) external nonReentrant {
        Launch storage l = launches[token];
        require(!l.graduated, "Graduated, sell on DEX");
        require(tokenAmount > 0, "Amount 0");

        // Inject any external revenue (royalties) into the curve before trading
        _injectRevenue(token);

        uint256 curveSupply = curveSupplies[token];
        require(curveSupply > 0, "Curve not initialized");

        // Hitung IP yang didapat (Reverse formula)
        uint256 ipReturn = getAmountOut(tokenAmount, curveSupply - l.tokensSold, l.totalRaised + VIRTUAL_IP_RESERVE);
        
        // Safety check agar tidak menguras balance kontrak di bawah 0
        if (ipReturn > address(this).balance) {
            ipReturn = address(this).balance;
        }

        require(ipReturn > 0, "No IP to return");

        // Fee split on the output side
        uint256 feeAmount = (ipReturn * FEE_BPS) / 10000;
        uint256 userAmount = ipReturn - feeAmount;

        // Slippage protection: cek minimal IP bersih yang diterima user
        require(userAmount >= minIpOut, "Slippage too high");

        // Update State (totalRaised berkurang sebesar IP yang keluar dari curve, termasuk fee)
        l.tokensSold -= tokenAmount;
        l.totalRaised -= ipReturn;

        // Eksekusi
        IERC20(token).transferFrom(msg.sender, address(this), tokenAmount);

        if (feeAmount > 0) {
            (bool successFee, ) = payable(feeTo).call{value: feeAmount}("");
            require(successFee, "Fee transfer failed");
        }

        (bool successUser, ) = payable(msg.sender).call{value: userAmount}("");
        require(successUser, "User transfer failed");
        
        emit Sold(token, msg.sender, tokenAmount, ipReturn);
    }

    // 4. HOLDER: Redeem wrapper token back into underlying Royalty Token (1:1)
    function redeem(address wrapperToken, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount 0");
        address underlying = underlyingTokens[wrapperToken];
        require(underlying != address(0), "Invalid wrapper");

        // Pull wrapper tokens from user
        IERC20(wrapperToken).transferFrom(msg.sender, address(this), amount);

        // Burn the wrapper tokens held by launchpad (owner of SovryToken)
        SovryToken(wrapperToken).burnFrom(address(this), amount);

        // Transfer underlying royalty tokens back to user
        require(IERC20(underlying).balanceOf(address(this)) >= amount, "Insufficient backing");
        IERC20(underlying).transfer(msg.sender, amount);

        emit Redeemed(wrapperToken, msg.sender, amount);
    }

    /// @notice Claim revenue from an external source and inject it into the bonding curve reserves.
    /// @dev This is a generic hook; integrate with Story Protocol royalty contracts via an adapter.
    function claimAndInjectRevenue(address token, address revenueSource) external onlyOwner nonReentrant {
        uint256 balanceBefore = address(this).balance;
        IRevenueSource(revenueSource).claimRevenue();
        uint256 balanceAfter = address(this).balance;

        require(balanceAfter >= balanceBefore, "No revenue claimed");
        // claimed may be zero depending on implementation, so also trust balance delta
        _injectRevenue(token);
    }

    /// @notice Simple Harvest & Pump: claim royalties in WIP for a wrapper token and pump the bonding curve.
    /// @dev Uses a generic IRoyaltyVault interface; wire the correct vault via setRoyaltyVault.
    function harvestAndPump(address wrapperToken) external nonReentrant {
        Launch storage l = launches[wrapperToken];
        require(l.token != address(0), "Unknown launch");
        require(!l.graduated, "Graduated");

        address rtAddress = l.royaltyToken;
        require(rtAddress != address(0), "No royalty token");

        address royaltyVault = l.royaltyVault;
        require(royaltyVault != address(0), "No royalty vault");

        // 1. Check WIP balance before
        uint256 balanceBefore = IERC20(WIP).balanceOf(address(this));

        // 2. Claim royalties from the Royalty Vault on behalf of this contract (RT holder)
        IRoyaltyVault(royaltyVault).claimRevenue(rtAddress, address(0));

        // 3. Check WIP balance after
        uint256 balanceAfter = IERC20(WIP).balanceOf(address(this));
        require(balanceAfter > balanceBefore, "No royalties to claim");

        uint256 claimedAmount = balanceAfter - balanceBefore;

        // 4. Pump: treat claimed WIP as additional effective reserve on the curve
        l.totalRaised += claimedAmount;

        emit RevenueInjected(wrapperToken, claimedAmount);
    }

    /// @notice Harvest Story Protocol royalties for a given IP context and inject them into the bonding curve.
    /// @dev Caller must provide the correct IP graph and royalty policy context expected by RoyaltyWorkflows.
    function harvestAndPump(
        address token,
        address ancestorIpId,
        address[] calldata childIpIds,
        address[] calldata royaltyPolicies,
        address[] calldata currencyTokens
    ) external nonReentrant {
        Launch storage l = launches[token];
        require(l.token != address(0), "Unknown launch");
        require(!l.graduated, "Graduated");

        uint256 balanceBefore = address(this).balance;

        IRoyaltyWorkflows(ROYALTY_WORKFLOWS).claimAllRevenue(
            ancestorIpId,
            address(this),
            childIpIds,
            royaltyPolicies,
            currencyTokens
        );

        uint256 balanceAfter = address(this).balance;
        require(balanceAfter > balanceBefore, "No royalties to claim");

        uint256 claimedAmount = balanceAfter - balanceBefore;

        // Any newly received native IP held by this contract is treated as extra curve reserve.
        _injectRevenue(token);

        emit RevenueInjected(token, claimedAmount);
    }

    /// @notice Internal hook to treat any excess IP balance as additional curve reserve for a token.
    /// @dev Assumes this launchpad primarily manages a single active token at a time.
    function _injectRevenue(address token) internal {
        Launch storage l = launches[token];
        if (l.token == address(0) || l.graduated) {
            return;
        }

        // Current native IP balance held by this contract
        uint256 currentBalance = address(this).balance;

        // If balance is not greater than what the curve already accounts for,
        // there is no external revenue to inject.
        if (currentBalance <= l.totalRaised) {
            return;
        }

        uint256 excessIP = currentBalance - l.totalRaised;
        // Treat the excess as additional IP reserve in the bonding curve.
        l.totalRaised += excessIP;
    }

    // INTERNAL: Pindah ke Uniswap (Graduation)
    function _graduate(address token) internal {
        Launch storage l = launches[token];
        l.graduated = true;

        // Ambil semua IP yang terkumpul + Sisa Token (20% Supply + Sisa Curve)
        uint256 ipLiquidity = address(this).balance;
        uint256 tokenLiquidity = IERC20(token).balanceOf(address(this));

        // Approve Router untuk menggunakan Token
        IERC20(token).approve(PIPERX_ROUTER, tokenLiquidity);

        // Panggil SovryRouter.addLiquidityIP
        // LP Token dikirim ke address(0) -> BURN (Liquidity Locked Forever)
        // Ini membuat investor percaya tidak akan ada rug pull
        require(ipLiquidity > 0 && tokenLiquidity > 0, "Launchpad: no liquidity to graduate");

        // Set very small min amounts (> 0) to satisfy router checks while effectively allowing full deposit
        uint256 minToken = 1;
        uint256 minIP = 1;

        IExternalRouter(PIPERX_ROUTER).addLiquidityETH{value: ipLiquidity}(
            token,
            tokenLiquidity,
            minToken,
            minIP,
            address(0x000000000000000000000000000000000000dEaD), // Burn LP Tokens!
            block.timestamp + 600
        );

        emit Graduated(token, address(0), ipLiquidity);
    }

    // Helper: Formula xy=k (Input, ReserveIn, ReserveOut)
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256 amountOut) {
        uint256 amountInWithFee = amountIn * 995; // Fee 0.5% (bisa masuk ke Treasury Sovry)
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }
    
    // View function untuk Frontend menghitung estimasi
    function getEstimatedTokensForIP(address token, uint256 ipAmount) external view returns (uint256) {
        Launch memory l = launches[token];
        uint256 curveSupply = curveSupplies[token];
        if (curveSupply == 0 || curveSupply <= l.tokensSold) {
            return 0;
        }

        return getAmountOut(ipAmount, l.totalRaised + VIRTUAL_IP_RESERVE, curveSupply - l.tokensSold);
    }
}

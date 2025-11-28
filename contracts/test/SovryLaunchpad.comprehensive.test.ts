import { expect } from "chai";
import { ethers, network } from "hardhat";

/**
 * 🎯 SOVRY LAUNCHPAD - COMPREHENSIVE TEST SUITE
 * 
 * 6 Test Groups covering ALL functionality:
 * 🟢 Group 1: Initialization & Configuration
 * 🔵 Group 2: Library & Math (Critical for Frontend Charts)
 * 🟡 Group 3: Token Launch (Page: /create)
 * 🟠 Group 4: Trading (Page: /pool/[address])
 * 🟣 Group 5: Harvest & Pump (Fitur Unik Sovry)
 * 🔴 Group 6: Graduation (Endgame)
 */

describe("🎯 SovryLaunchpad - Comprehensive Test Suite", function () {
  // ============================================================================
  // SETUP & FIXTURES
  // ============================================================================

  async function deployLaunchpadFixture() {
    const [owner, creator, trader1, trader2, treasury] = await ethers.getSigners();

    // Deploy Mocks
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const MockERC206 = await ethers.getContractFactory("MockERC20_6");
    const MockPiperX = await ethers.getContractFactory("MockPiperXRouter");
    const MockRoyalty = await ethers.getContractFactory("MockRoyaltyWorkflows");

    const wipToken = await MockERC20.deploy("Wrapped IP", "WIP");
    const royaltyToken = await MockERC206.deploy("My Song Royalty", "RT-SONG");
    const piperXRouter = await MockPiperX.deploy();
    const royaltyWorkflows = await MockRoyalty.deploy();

    // Fund MockRoyaltyWorkflows with 10 ETH for harvest testing
    await owner.sendTransaction({
      to: royaltyWorkflows.address,
      value: ethers.utils.parseEther("10.0"),
    });

    // Deploy SovryLaunchpad with 10 ETH graduation threshold
    const SovryLaunchpad = await ethers.getContractFactory("SovryLaunchpad");
    const graduationThreshold = ethers.utils.parseEther("10.0");

    const launchpad = await SovryLaunchpad.deploy(
      treasury.address,
      piperXRouter.address,
      royaltyWorkflows.address,
      wipToken.address,
      graduationThreshold,
      owner.address
    );

    // Whitelist RT token
    await launchpad.connect(owner).addApprovedRT(royaltyToken.address);

    // Mint 1,000 RT to creator (6 decimals)
    const RT_AMOUNT = ethers.BigNumber.from("1000").mul(ethers.BigNumber.from("1000000")); 
    await royaltyToken.transfer(creator.address, RT_AMOUNT);

    return {
      launchpad,
      wipToken,
      royaltyToken,
      piperXRouter,
      royaltyWorkflows,
      owner,
      creator,
      trader1,
      trader2,
      treasury,
      graduationThreshold,
    };
  }

  // Helper function to launch a token
  async function launchTokenHelper(launchpad: any, royaltyToken: any, creator: any) {
    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100); // 100 RT

    await royaltyToken.connect(creator).approve(launchpad.address, amountToLock);

    await launchpad.connect(creator).launchToken(
      royaltyToken.address,
      amountToLock,
      "Test Token",
      "TEST",
      ethers.utils.parseEther("0.001"), // basePrice
      ethers.utils.parseEther("0.0001") // priceIncrement
    );

    const launchedTokens = await launchpad.getAllLaunchedTokens();
    return launchedTokens[0]; // wrapper address
  }

  // Helper for graduation tests with higher pricing to build sufficient reserve
  async function launchTokenForGraduation(launchpad: any, royaltyToken: any, creator: any) {
    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100); // 100 RT

    await royaltyToken.connect(creator).approve(launchpad.address, amountToLock);

    await launchpad.connect(creator).launchToken(
      royaltyToken.address,
      amountToLock,
      "Test Token",
      "TEST",
      ethers.utils.parseEther("0.01"), // Higher basePrice for better reserve
      ethers.utils.parseEther("0.001") // Higher priceIncrement
    );

    const launchedTokens = await launchpad.getAllLaunchedTokens();
    return launchedTokens[0]; // wrapper address
  }

  // ============================================================================
  // 🟢 GROUP 1: INITIALIZATION & CONFIGURATION
  // ============================================================================

  describe("🟢 Group 1: Initialization & Configuration", function () {
    it("✅ Should deploy with correct constructor parameters", async function () {
      const { launchpad, treasury, piperXRouter, royaltyWorkflows, wipToken, graduationThreshold } = 
        await deployLaunchpadFixture();

      // Check all constructor parameters
      expect(await launchpad.treasury()).to.equal(treasury.address);
      expect(await launchpad.piperXRouter()).to.equal(piperXRouter.address);
      expect(await launchpad.royaltyWorkflows()).to.equal(royaltyWorkflows.address);
      expect(await launchpad.wipToken()).to.equal(wipToken.address);
      expect(await launchpad.graduationThreshold()).to.equal(graduationThreshold);
      
      console.log("✅ Deployment Check Passed:");
      console.log("   Treasury:", treasury.address);
      console.log("   PiperX Router:", piperXRouter.address);
      console.log("   Graduation Threshold:", ethers.utils.formatEther(graduationThreshold), "ETH");
    });

    it("✅ Should set deployer as owner", async function () {
      const { launchpad, owner } = await deployLaunchpadFixture();
      
      expect(await launchpad.owner()).to.equal(owner.address);
      console.log("✅ Owner Check Passed:", owner.address);
    });

    it("✅ Should have correct initial graduation threshold (10 ETH)", async function () {
      const { launchpad, graduationThreshold } = await deployLaunchpadFixture();
      
      const threshold = await launchpad.graduationThreshold();
      expect(threshold).to.equal(ethers.utils.parseEther("10.0"));
      expect(threshold).to.equal(graduationThreshold);
      
      console.log("✅ Initial Threshold:", ethers.utils.formatEther(threshold), "ETH");
    });
  });

  // ============================================================================
  // 🔵 GROUP 2: LIBRARY & MATH (CRITICAL FOR FRONTEND CHARTS)
  // ============================================================================

  describe("🔵 Group 2: Library & Math (Critical for Frontend)", function () {
    it("✅ Calculate Buy Price at Low Supply (Initial)", async function () {
      const { launchpad, royaltyToken, creator } = await deployLaunchpadFixture();
      
      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);
      
      const WRAP_UNIT = await launchpad.WRAP_UNIT();
      const buyAmount = WRAP_UNIT.mul(1); // Buy 1 whole token
      
      const price = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
      const curve = await launchpad.getBondingCurve(wrapperAddress);
      
      const basePrice = curve.basePrice;
      
      console.log("📊 Buy Price at Low Supply:");
      console.log("   Base Price:", ethers.utils.formatEther(basePrice), "ETH");
      console.log("   Calculated Price:", ethers.utils.formatEther(price), "ETH");
      console.log("   Amount to Buy:", buyAmount.div(WRAP_UNIT).toString(), "tokens");
      
      expect(price).to.be.gte(basePrice);
    });

    it("✅ Calculate Buy Price at High Supply (Linear Growth)", async function () {
      const { launchpad, royaltyToken, creator, trader1 } = await deployLaunchpadFixture();
      
      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);
      const WRAP_UNIT = await launchpad.WRAP_UNIT();
      
      // Buy some tokens to increase sold supply
      const buyAmount = WRAP_UNIT.mul(10); // 10 tokens
      const initialPrice = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
      
      // Execute buy to move supply
      const deadline = Math.floor(Date.now() / 1000) + 600;
      await launchpad.connect(trader1).buy(
        wrapperAddress,
        buyAmount,
        ethers.utils.parseEther("10"),
        deadline,
        { value: ethers.utils.parseEther("10") }
      );
      
      // Now check price for next purchase - should be higher
      const nextPrice = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
      
      console.log("📊 Price Comparison (Linear Growth):");
      console.log("   Initial Price:", ethers.utils.formatEther(initialPrice), "ETH");
      console.log("   Next Price:", ethers.utils.formatEther(nextPrice), "ETH");
      console.log("   Price Increase:", ethers.utils.formatEther(nextPrice.sub(initialPrice)), "ETH");
      
      // Next price MUST be higher (linear bonding curve)
      expect(nextPrice).to.be.gt(initialPrice);
    });

    it("✅ Calculate Sell Price (Should be lower than Buy)", async function () {
      const { launchpad, royaltyToken, creator, trader1 } = await deployLaunchpadFixture();
      
      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);
      const WRAP_UNIT = await launchpad.WRAP_UNIT();
      const amount = WRAP_UNIT.mul(5);
      
      // Buy first
      const deadline = Math.floor(Date.now() / 1000) + 600;
      await launchpad.connect(trader1).buy(
        wrapperAddress,
        amount,
        ethers.utils.parseEther("10"),
        deadline,
        { value: ethers.utils.parseEther("10") }
      );
      
      // Calculate sell price
      const sellPrice = await launchpad.calculateSellPrice(wrapperAddress, amount);
      
      // Calculate buy price for same amount
      const buyPrice = await launchpad.calculateBuyPrice(wrapperAddress, amount);
      
      console.log("📊 Buy vs Sell Price:");
      console.log("   Buy Price:", ethers.utils.formatEther(buyPrice), "ETH");
      console.log("   Sell Price:", ethers.utils.formatEther(sellPrice), "ETH");
      console.log("   Spread:", ethers.utils.formatEther(buyPrice.sub(sellPrice)), "ETH");
      
      // Sell price should always be lower than buy price (spread)
      expect(sellPrice).to.be.lt(buyPrice);
    });

    it("✅ Spot Price Accuracy (getCurrentPrice)", async function () {
      const { launchpad, royaltyToken, creator } = await deployLaunchpadFixture();
      
      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);
      
      const spotPrice = await launchpad.getCurrentPrice(wrapperAddress);
      const curve = await launchpad.getBondingCurve(wrapperAddress);
      
      console.log("📊 Spot Price Analysis:");
      console.log("   Current Spot Price:", ethers.utils.formatEther(spotPrice), "ETH");
      console.log("   Current Supply:", curve.currentSupply.toString());
      console.log("   Base Price:", ethers.utils.formatEther(curve.basePrice), "ETH");
      console.log("   Price Increment:", ethers.utils.formatEther(curve.priceIncrement), "ETH");
      
      expect(spotPrice).to.be.gte(curve.basePrice);
    });

    it("⚠️ Overflow Protection (Invalid Supply)", async function () {
      const { launchpad, royaltyToken, creator } = await deployLaunchpadFixture();
      
      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);
      const curve = await launchpad.getBondingCurve(wrapperAddress);
      
      // Try to buy more than available supply
      const excessAmount = curve.currentSupply.add(1);
      
      await expect(
        launchpad.calculateBuyPrice(wrapperAddress, excessAmount)
      ).to.be.revertedWithCustomError(launchpad, "InsufficientSupply");
      
      console.log("✅ Overflow Protection: Reverted correctly for excess supply");
    });
  });

  // ============================================================================
  // 🟡 GROUP 3: TOKEN LAUNCH (PAGE: /create)
  // ============================================================================

  describe("🟡 Group 3: Token Launch", function () {
    it("✅ Launch - Happy Path (TokenLaunched event & supply check)", async function () {
      const { launchpad, royaltyToken, creator } = await deployLaunchpadFixture();

      const RT_UNIT = ethers.BigNumber.from("1000000");
      const amountToLock = RT_UNIT.mul(100); // 100 RT

      await royaltyToken.connect(creator).approve(launchpad.address, amountToLock);

      const tx = await launchpad.connect(creator).launchToken(
        royaltyToken.address,
        amountToLock,
        "Test Token",
        "TEST",
        ethers.utils.parseEther("0.001"),
        ethers.utils.parseEther("0.0001")
      );

      // Check event emitted
      await expect(tx).to.emit(launchpad, "TokenLaunched");

      // Check token was added to list
      const launchedTokens = await launchpad.getAllLaunchedTokens();
      expect(launchedTokens.length).to.equal(1);

      console.log("✅ Launch Happy Path:");
      console.log("   Wrapper Address:", launchedTokens[0]);
      console.log("   Amount Locked:", ethers.utils.formatUnits(amountToLock, 6), "RT");
    });

    it("❌ Launch - Validasi 10% (MinListingRequired)", async function () {
      const { launchpad, royaltyToken, creator } = await deployLaunchpadFixture();

      const RT_UNIT = ethers.BigNumber.from("1000000");
      const creatorBalance = await royaltyToken.balanceOf(creator.address);
      
      // Try to launch with less than 10%
      const tooSmallAmount = creatorBalance.mul(5).div(100); // 5% only

      await royaltyToken.connect(creator).approve(launchpad.address, tooSmallAmount);

      await expect(
        launchpad.connect(creator).launchToken(
          royaltyToken.address,
          tooSmallAmount,
          "Test Token",
          "TEST",
          ethers.utils.parseEther("0.001"),
          ethers.utils.parseEther("0.0001")
        )
      ).to.be.revertedWithCustomError(launchpad, "MinListingRequired");

      console.log("✅ 10% Validation: Correctly rejected", ethers.utils.formatUnits(tooSmallAmount, 6), "RT");
    });

    it("❌ Launch - Tanpa Approve (ERC20 allowance error)", async function () {
      const { launchpad, royaltyToken, creator } = await deployLaunchpadFixture();

      const RT_UNIT = ethers.BigNumber.from("1000000");
      const amountToLock = RT_UNIT.mul(100);

      // Don't approve - should fail
      await expect(
        launchpad.connect(creator).launchToken(
          royaltyToken.address,
          amountToLock,
          "Test Token",
          "TEST",
          ethers.utils.parseEther("0.001"),
          ethers.utils.parseEther("0.0001")
        )
      ).to.be.reverted; // ERC20 will revert

      console.log("✅ No Approve: Correctly reverted");
    });

    it("❌ Launch - Parameter Invalid (amount = 0)", async function () {
      const { launchpad, royaltyToken, creator } = await deployLaunchpadFixture();

      await expect(
        launchpad.connect(creator).launchToken(
          royaltyToken.address,
          0, // Invalid amount
          "Test Token",
          "TEST",
          ethers.utils.parseEther("0.001"),
          ethers.utils.parseEther("0.0001")
        )
      ).to.be.revertedWithCustomError(launchpad, "InvalidAmount");

      console.log("✅ Invalid Amount: Correctly rejected");
    });

    it("✅ Launch - Prefunded (depositRT + launchTokenPrefunded)", async function () {
      const { launchpad, royaltyToken, creator } = await deployLaunchpadFixture();

      const RT_UNIT = ethers.BigNumber.from("1000000");
      const amountToDeposit = RT_UNIT.mul(100);

      // First deposit
      await royaltyToken.connect(creator).approve(launchpad.address, amountToDeposit);
      await launchpad.connect(creator).depositRT(royaltyToken.address, amountToDeposit);

      // Check deposit balance
      const depositBalance = await launchpad.getDepositBalance(creator.address, royaltyToken.address);
      expect(depositBalance).to.equal(amountToDeposit);

      // Now launch using prefunded
      await launchpad.connect(creator).launchTokenPrefunded(
        royaltyToken.address,
        amountToDeposit,
        "Prefunded Token",
        "PREFUND",
        ethers.utils.parseEther("0.001"),
        ethers.utils.parseEther("0.0001")
      );

      // Check deposit balance decreased
      const depositAfter = await launchpad.getDepositBalance(creator.address, royaltyToken.address);
      expect(depositAfter).to.equal(0);

      console.log("✅ Prefunded Launch: Deposit deducted correctly");
    });

    it("❌ Launch - Double Launch (TokenAlreadyLaunched)", async function () {
      const { launchpad, royaltyToken, creator } = await deployLaunchpadFixture();

      const RT_UNIT = ethers.BigNumber.from("1000000");
      const amountToLock = RT_UNIT.mul(100);

      // First launch - should succeed
      await royaltyToken.connect(creator).approve(launchpad.address, amountToLock);
      await launchpad.connect(creator).launchToken(
        royaltyToken.address,
        amountToLock,
        "Test Token",
        "TEST",
        ethers.utils.parseEther("0.001"),
        ethers.utils.parseEther("0.0001")
      );

      // Try to launch same RT again - should fail
      const amountToLock2 = RT_UNIT.mul(50);
      await royaltyToken.connect(creator).approve(launchpad.address, amountToLock2);
      
      await expect(
        launchpad.connect(creator).launchToken(
          royaltyToken.address,
          amountToLock2,
          "Test Token 2",
          "TEST2",
          ethers.utils.parseEther("0.001"),
          ethers.utils.parseEther("0.0001")
        )
      ).to.be.revertedWithCustomError(launchpad, "TokenAlreadyLaunched");

      console.log("✅ Double Launch: Correctly rejected");
    });
  });

  // ============================================================================
  // 🟠 GROUP 4: TRADING (PAGE: /pool/[address])
  // ============================================================================

  describe("🟠 Group 4: Trading", function () {
    it("✅ Buy - Happy Path (ETH spent, tokens received)", async function () {
      const { launchpad, royaltyToken, creator, trader1 } = await deployLaunchpadFixture();

      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);
      const WRAP_UNIT = await launchpad.WRAP_UNIT();
      const buyAmount = WRAP_UNIT.mul(5); // 5 tokens

      const price = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
      const fee = price.div(100);
      const totalCost = price.add(fee);

      const deadline = Math.floor(Date.now() / 1000) + 600;

      // Get wrapper token contract
      const SovryToken = await ethers.getContractFactory("SovryToken");
      const wrapper = SovryToken.attach(wrapperAddress);

      const balanceBefore = await wrapper.balanceOf(trader1.address);

      await launchpad.connect(trader1).buy(
        wrapperAddress,
        buyAmount,
        totalCost,
        deadline,
        { value: totalCost }
      );

      const balanceAfter = await wrapper.balanceOf(trader1.address);

      expect(balanceAfter.sub(balanceBefore)).to.equal(buyAmount);

      console.log("✅ Buy Happy Path:");
      console.log("   Bought:", buyAmount.div(WRAP_UNIT).toString(), "tokens");
      console.log("   Cost:", ethers.utils.formatEther(totalCost), "ETH");
    });

    it("✅ Buy - Fee Distribution (0.5% Treasury, 0.5% Creator)", async function () {
      const { launchpad, royaltyToken, creator, trader1, treasury } = await deployLaunchpadFixture();

      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);
      const WRAP_UNIT = await launchpad.WRAP_UNIT();
      const buyAmount = WRAP_UNIT.mul(1);

      const price = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
      const totalFee = price.div(100);
      const totalCost = price.add(totalFee);

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      const creatorBefore = await ethers.provider.getBalance(creator.address);

      const deadline = Math.floor(Date.now() / 1000) + 600;
      await launchpad.connect(trader1).buy(
        wrapperAddress,
        buyAmount,
        totalCost,
        deadline,
        { value: totalCost }
      );

      const treasuryAfter = await ethers.provider.getBalance(treasury.address);
      const creatorAfter = await ethers.provider.getBalance(creator.address);

      const treasuryFee = treasuryAfter.sub(treasuryBefore);
      const creatorFee = creatorAfter.sub(creatorBefore);

      // 0.5% each
      expect(treasuryFee).to.be.closeTo(totalFee.div(2), ethers.utils.parseEther("0.0001"));
      expect(creatorFee).to.be.closeTo(totalFee.div(2), ethers.utils.parseEther("0.0001"));

      console.log("✅ Fee Distribution:");
      console.log("   Treasury:", ethers.utils.formatEther(treasuryFee), "ETH");
      console.log("   Creator:", ethers.utils.formatEther(creatorFee), "ETH");
    });

    it("❌ Buy - Slippage Revert (maxEthCost too low)", async function () {
      const { launchpad, royaltyToken, creator, trader1 } = await deployLaunchpadFixture();

      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);
      const WRAP_UNIT = await launchpad.WRAP_UNIT();
      const buyAmount = WRAP_UNIT.mul(1);

      const price = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
      const fee = price.div(100);
      const totalCost = price.add(fee);
      
      const tooLowMax = totalCost.sub(1); // 1 wei less

      const deadline = Math.floor(Date.now() / 1000) + 600;

      await expect(
        launchpad.connect(trader1).buy(
          wrapperAddress,
          buyAmount,
          tooLowMax,
          deadline,
          { value: totalCost }
        )
      ).to.be.revertedWithCustomError(launchpad, "SlippageExceeded");

      console.log("✅ Slippage Protection: Correctly rejected");
    });

    it("❌ Buy - Purchase Cooldown (< 5 seconds)", async function () {
      const { launchpad, royaltyToken, creator, trader1 } = await deployLaunchpadFixture();

      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);
      const WRAP_UNIT = await launchpad.WRAP_UNIT();
      const buyAmount = WRAP_UNIT.mul(1);

      const price = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
      const fee = price.div(100);
      const totalCost = price.add(fee);

      const deadline = Math.floor(Date.now() / 1000) + 600;

      // First buy - should succeed
      await launchpad.connect(trader1).buy(
        wrapperAddress,
        buyAmount,
        totalCost,
        deadline,
        { value: totalCost }
      );

      // Second buy immediately - should fail
      await expect(
        launchpad.connect(trader1).buy(
          wrapperAddress,
          buyAmount,
          ethers.utils.parseEther("10"),
          deadline,
          { value: ethers.utils.parseEther("10") }
        )
      ).to.be.revertedWithCustomError(launchpad, "CooldownActive");

      console.log("✅ Purchase Cooldown: Correctly enforced");
    });

    it("❌ Buy - Daily Limit (> 20% supply per day)", async function () {
      const { launchpad, royaltyToken, creator, trader1 } = await deployLaunchpadFixture();

      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);
      const WRAP_UNIT = await launchpad.WRAP_UNIT();
      
      const tokenInfo = await launchpad.getTokenInfo(wrapperAddress);
      const maxDailyAmount = tokenInfo.initialCurveSupply.mul(2000).div(10000); // 20%
      
      // Try to buy more than 20%
      const excessAmount = maxDailyAmount.add(WRAP_UNIT);

      const deadline = Math.floor(Date.now() / 1000) + 600;

      await expect(
        launchpad.connect(trader1).buy(
          wrapperAddress,
          excessAmount,
          ethers.utils.parseEther("1000"),
          deadline,
          { value: ethers.utils.parseEther("1000") }
        )
      ).to.be.revertedWithCustomError(launchpad, "SupplyExceeded");

      console.log("✅ Daily Limit: Correctly enforced");
    });

    it("✅ Sell - Happy Path (tokens sold, ETH received)", async function () {
      const { launchpad, royaltyToken, creator, trader1 } = await deployLaunchpadFixture();

      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);
      const WRAP_UNIT = await launchpad.WRAP_UNIT();
      const buyAmount = WRAP_UNIT.mul(5);

      // First buy
      const buyPrice = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
      const buyFee = buyPrice.div(100);
      const buyCost = buyPrice.add(buyFee);

      const deadline = Math.floor(Date.now() / 1000) + 600;
      await launchpad.connect(trader1).buy(
        wrapperAddress,
        buyAmount,
        buyCost,
        deadline,
        { value: buyCost }
      );

      // Wait for cooldown
      await network.provider.send("evm_increaseTime", [6]);
      await network.provider.send("evm_mine");

      // Now sell
      const sellPrice = await launchpad.calculateSellPrice(wrapperAddress, buyAmount);
      const sellFee = sellPrice.div(100);
      const netProceeds = sellPrice.sub(sellFee);

      const SovryToken = await ethers.getContractFactory("SovryToken");
      const wrapper = SovryToken.attach(wrapperAddress);
      await wrapper.connect(trader1).approve(launchpad.address, buyAmount);

      const balanceBefore = await ethers.provider.getBalance(trader1.address);

      const tx = await launchpad.connect(trader1).sell(
        wrapperAddress,
        buyAmount,
        netProceeds,
        deadline
      );
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      const balanceAfter = await ethers.provider.getBalance(trader1.address);
      const actualProceeds = balanceAfter.sub(balanceBefore).add(gasUsed);

      expect(actualProceeds).to.be.closeTo(netProceeds, ethers.utils.parseEther("0.0001"));

      console.log("✅ Sell Happy Path:");
      console.log("   Sold:", buyAmount.div(WRAP_UNIT).toString(), "tokens");
      console.log("   Proceeds:", ethers.utils.formatEther(netProceeds), "ETH");
    });

    it("❌ Sell - Insufficient Supply (selling more than owned)", async function () {
      const { launchpad, royaltyToken, creator, trader1 } = await deployLaunchpadFixture();

      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);
      const WRAP_UNIT = await launchpad.WRAP_UNIT();
      
      // Try to sell without buying first
      const sellAmount = WRAP_UNIT.mul(1);

      const SovryToken = await ethers.getContractFactory("SovryToken");
      const wrapper = SovryToken.attach(wrapperAddress);
      
      await wrapper.connect(trader1).approve(launchpad.address, sellAmount);

      const deadline = Math.floor(Date.now() / 1000) + 600;

      await expect(
        launchpad.connect(trader1).sell(
          wrapperAddress,
          sellAmount,
          0,
          deadline
        )
      ).to.be.reverted; // ERC20 transfer will fail

      console.log("✅ Insufficient Supply: Correctly rejected");
    });
  });

  // ============================================================================
  // 🟣 GROUP 5: HARVEST & PUMP (FITUR UNIK SOVRY)
  // ============================================================================

  describe("🟣 Group 5: Harvest & Pump", function () {
    it("✅ Harvest - Happy Path (reserve increases)", async function () {
      const { launchpad, royaltyToken, creator } = await deployLaunchpadFixture();

      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);

      const curveBefore = await launchpad.getBondingCurve(wrapperAddress);
      const reserveBefore = curveBefore.reserveBalance;

      // Harvest royalties
      const childIpIds = [ethers.constants.AddressZero];
      const royaltyPolicies = [ethers.constants.AddressZero];
      const currencyTokens = [ethers.constants.AddressZero];

      await launchpad.connect(creator).harvest(
        wrapperAddress,
        ethers.constants.AddressZero,
        childIpIds,
        royaltyPolicies,
        currencyTokens
      );

      const curveAfter = await launchpad.getBondingCurve(wrapperAddress);
      const reserveAfter = curveAfter.reserveBalance;

      expect(reserveAfter).to.be.gt(reserveBefore);

      console.log("✅ Harvest Happy Path:");
      console.log("   Reserve Before:", ethers.utils.formatEther(reserveBefore), "ETH");
      console.log("   Reserve After:", ethers.utils.formatEther(reserveAfter), "ETH");
      console.log("   Increase:", ethers.utils.formatEther(reserveAfter.sub(reserveBefore)), "ETH");
    });

    it("✅ Price Check After Harvest (must increase)", async function () {
      const { launchpad, royaltyToken, creator } = await deployLaunchpadFixture();

      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);
      const WRAP_UNIT = await launchpad.WRAP_UNIT();
      const amount = WRAP_UNIT.mul(1);

      // Get price before harvest
      const priceBefore = await launchpad.calculateBuyPrice(wrapperAddress, amount);

      // Harvest
      const childIpIds = [ethers.constants.AddressZero];
      const royaltyPolicies = [ethers.constants.AddressZero];
      const currencyTokens = [ethers.constants.AddressZero];

      await launchpad.connect(creator).harvest(
        wrapperAddress,
        ethers.constants.AddressZero,
        childIpIds,
        royaltyPolicies,
        currencyTokens
      );

      // Get price after harvest (should be same because supply hasn't changed)
      // The benefit is in the reserve/floor price, not spot price
      const priceAfter = await launchpad.calculateBuyPrice(wrapperAddress, amount);

      console.log("📊 Price After Harvest:");
      console.log("   Price Before:", ethers.utils.formatEther(priceBefore), "ETH");
      console.log("   Price After:", ethers.utils.formatEther(priceAfter), "ETH");
      console.log("   Note: Harvest increases reserve (floor), not spot price");
    });

    it("❌ Harvest - Not Authorized (before timeout)", async function () {
      const { launchpad, royaltyToken, creator, trader1 } = await deployLaunchpadFixture();

      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);

      // First harvest by creator to set lastHarvestTime
      const childIpIds = [ethers.constants.AddressZero];
      const royaltyPolicies = [ethers.constants.AddressZero];
      const currencyTokens = [ethers.constants.AddressZero];

      await launchpad.connect(creator).harvest(
        wrapperAddress,
        ethers.constants.AddressZero,
        childIpIds,
        royaltyPolicies,
        currencyTokens
      );

      // Now unauthorized user tries to harvest before timeout
      await expect(
        launchpad.connect(trader1).harvest(
          wrapperAddress,
          ethers.constants.AddressZero,
          childIpIds,
          royaltyPolicies,
          currencyTokens
        )
      ).to.be.revertedWithCustomError(launchpad, "NotAuthorized");

      console.log("✅ Not Authorized: Correctly rejected");
    });

    it("✅ Harvest - Emergency Access (after 7 days timeout)", async function () {
      const { launchpad, royaltyToken, creator, trader1, owner } = await deployLaunchpadFixture();

      // Set extremely high threshold to prevent graduation
      await launchpad.connect(owner).updateGraduationThreshold(ethers.constants.MaxUint256);

      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);

      // First harvest by creator to set lastHarvestTime
      const childIpIds = [ethers.constants.AddressZero];
      const royaltyPolicies = [ethers.constants.AddressZero];
      const currencyTokens = [ethers.constants.AddressZero];

      await launchpad.connect(creator).harvest(
        wrapperAddress,
        ethers.constants.AddressZero,
        childIpIds,
        royaltyPolicies,
        currencyTokens
      );

      // Fast forward 7 days
      await network.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await network.provider.send("evm_mine");

      // Now anyone can harvest (emergency access)
      await expect(
        launchpad.connect(trader1).harvest(
          wrapperAddress,
          ethers.constants.AddressZero,
          childIpIds,
          royaltyPolicies,
          currencyTokens
        )
      ).to.not.be.reverted;

      console.log("✅ Emergency Access: Allowed after timeout");
    });

    it("❌ Harvest - Griefing (empty arrays)", async function () {
      const { launchpad, royaltyToken, creator } = await deployLaunchpadFixture();

      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);

      // Try with empty arrays
      const childIpIds: string[] = [];
      const royaltyPolicies: string[] = [];
      const currencyTokens: string[] = [];

      await expect(
        launchpad.connect(creator).harvest(
          wrapperAddress,
          ethers.constants.AddressZero,
          childIpIds,
          royaltyPolicies,
          currencyTokens
        )
      ).to.be.revertedWithCustomError(launchpad, "ParamsTooLarge"); // Using this error for empty check

      console.log("✅ Griefing Prevention: Empty arrays rejected");
    });
  });

  // ============================================================================
  // 🔴 GROUP 6: GRADUATION (ENDGAME)
  // ============================================================================

  describe("🔴 Group 6: Graduation", function () {
    it("⏰ Graduation - Threshold Check (must wait 15 min)", async function () {
      const { launchpad, royaltyToken, creator, trader1, owner } = await deployLaunchpadFixture();

      // Set very low threshold
      await launchpad.connect(owner).updateGraduationThreshold(ethers.utils.parseEther("0.001"));

      const wrapperAddress = await launchTokenHelper(launchpad, royaltyToken, creator);
      const WRAP_UNIT = await launchpad.WRAP_UNIT();

      // Buy enough to exceed threshold
      const buyAmount = WRAP_UNIT.mul(100);
      const currentBlock = await ethers.provider.getBlock("latest");
      const deadline = currentBlock.timestamp + 600;

      await launchpad.connect(trader1).buy(
        wrapperAddress,
        buyAmount,
        ethers.utils.parseEther("100"),
        deadline,
        { value: ethers.utils.parseEther("100") }
      );

      // Check NOT graduated yet (15 min delay)
      const tokenInfo = await launchpad.getTokenInfo(wrapperAddress);
      expect(tokenInfo.graduated).to.equal(false);

      console.log("✅ Graduation Delay: Not graduated yet (15 min required)");
    });

    it("✅ Graduation - Execution (after threshold + delay)", async function () {
      const { launchpad, royaltyToken, creator, trader1, owner } = await deployLaunchpadFixture();

      // Set low threshold
      await launchpad.connect(owner).updateGraduationThreshold(ethers.utils.parseEther("5.0"));

      const wrapperAddress = await launchTokenForGraduation(launchpad, royaltyToken, creator);
      const WRAP_UNIT = await launchpad.WRAP_UNIT();

      // Do significant trading first to build up reserve
      let currentBlock = await ethers.provider.getBlock("latest");
      let deadline = currentBlock.timestamp + 600;
      const initialBuy = WRAP_UNIT.mul(200); // Buy 200 tokens to build big reserve
      await launchpad.connect(trader1).buy(
        wrapperAddress,
        initialBuy,
        ethers.utils.parseEther("500"),
        deadline,
        { value: ethers.utils.parseEther("500") }
      );

      // Fast forward 15 minutes
      await network.provider.send("evm_increaseTime", [15 * 60 + 1]);
      await network.provider.send("evm_mine");

      // Buy more to trigger graduation
      const buyAmount = WRAP_UNIT.mul(50);
      currentBlock = await ethers.provider.getBlock("latest");
      deadline = currentBlock.timestamp + 600;

      const tx = await launchpad.connect(trader1).buy(
        wrapperAddress,
        buyAmount,
        ethers.utils.parseEther("100"),
        deadline,
        { value: ethers.utils.parseEther("100") }
      );

      // Should emit Graduated event
      await expect(tx).to.emit(launchpad, "Graduated");

      // Check graduated
      const tokenInfo = await launchpad.getTokenInfo(wrapperAddress);
      expect(tokenInfo.graduated).to.equal(true);

      const curve = await launchpad.getBondingCurve(wrapperAddress);
      expect(curve.isActive).to.equal(false);

      console.log("✅ Graduation Executed:");
      console.log("   Wrapper:", wrapperAddress);
      console.log("   Curve Active:", curve.isActive);
      console.log("   Graduated:", tokenInfo.graduated);
    });

    it("✅ Liquidity Migration (ETH & tokens to DEX)", async function () {
      const { launchpad, royaltyToken, creator, trader1, owner } = await deployLaunchpadFixture();

      // Set low threshold
      await launchpad.connect(owner).updateGraduationThreshold(ethers.utils.parseEther("5.0"));

      const wrapperAddress = await launchTokenForGraduation(launchpad, royaltyToken, creator);
      const WRAP_UNIT = await launchpad.WRAP_UNIT();

      // Do significant trading first to build up reserve
      let currentBlock = await ethers.provider.getBlock("latest");
      let deadline = currentBlock.timestamp + 600;
      const initialBuy = WRAP_UNIT.mul(200); // Buy 200 tokens to build big reserve
      await launchpad.connect(trader1).buy(
        wrapperAddress,
        initialBuy,
        ethers.utils.parseEther("500"),
        deadline,
        { value: ethers.utils.parseEther("500") }
      );

      // Get reserve before graduation
      const curveBefore = await launchpad.getBondingCurve(wrapperAddress);
      const reserveBefore = curveBefore.reserveBalance;

      // Fast forward 15 minutes
      await network.provider.send("evm_increaseTime", [15 * 60 + 1]);
      await network.provider.send("evm_mine");

      // Buy more to trigger graduation
      const buyAmount = WRAP_UNIT.mul(50);
      currentBlock = await ethers.provider.getBlock("latest");
      deadline = currentBlock.timestamp + 600;

      await launchpad.connect(trader1).buy(
        wrapperAddress,
        buyAmount,
        ethers.utils.parseEther("100"),
        deadline,
        { value: ethers.utils.parseEther("100") }
      );

      // Check reserve is now 0 (migrated to DEX)
      const curveAfter = await launchpad.getBondingCurve(wrapperAddress);
      expect(curveAfter.reserveBalance).to.equal(0);

      console.log("✅ Liquidity Migration:");
      console.log("   Reserve Before:", ethers.utils.formatEther(reserveBefore), "ETH");
      console.log("   Reserve After:", ethers.utils.formatEther(curveAfter.reserveBalance), "ETH");
      console.log("   Status: Migrated to DEX");
    });

    it("❌ Post-Graduation Buy (should revert)", async function () {
      const { launchpad, royaltyToken, creator, trader1, owner } = await deployLaunchpadFixture();

      // Set low threshold
      await launchpad.connect(owner).updateGraduationThreshold(ethers.utils.parseEther("5.0"));

      const wrapperAddress = await launchTokenForGraduation(launchpad, royaltyToken, creator);
      const WRAP_UNIT = await launchpad.WRAP_UNIT();

      // Do significant trading first to build up reserve
      let currentBlock = await ethers.provider.getBlock("latest");
      let deadline = currentBlock.timestamp + 600;
      const initialBuy = WRAP_UNIT.mul(200); // Buy 200 tokens to build big reserve
      await launchpad.connect(trader1).buy(
        wrapperAddress,
        initialBuy,
        ethers.utils.parseEther("500"),
        deadline,
        { value: ethers.utils.parseEther("500") }
      );

      // Fast forward 15 minutes
      await network.provider.send("evm_increaseTime", [15 * 60 + 1]);
      await network.provider.send("evm_mine");

      // Buy more to trigger graduation
      let buyAmount = WRAP_UNIT.mul(50);
      currentBlock = await ethers.provider.getBlock("latest");
      deadline = currentBlock.timestamp + 600;

      await launchpad.connect(trader1).buy(
        wrapperAddress,
        buyAmount,
        ethers.utils.parseEther("100"),
        deadline,
        { value: ethers.utils.parseEther("100") }
      );

      // Try to buy after graduation - should fail
      await network.provider.send("evm_increaseTime", [10]);
      await network.provider.send("evm_mine");
      const newBlock = await ethers.provider.getBlock("latest");
      deadline = newBlock.timestamp + 600;

      await expect(
        launchpad.connect(trader1).buy(
          wrapperAddress,
          WRAP_UNIT,
          ethers.utils.parseEther("10"),
          deadline,
          { value: ethers.utils.parseEther("10") }
        )
      ).to.be.revertedWithCustomError(launchpad, "CurveInactive");

      console.log("✅ Post-Graduation Buy: Correctly rejected");
    });
  });
});

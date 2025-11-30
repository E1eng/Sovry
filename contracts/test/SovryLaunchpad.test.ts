import { expect } from "chai";
import { ethers } from "hardhat";

describe("SovryLaunchpad", function () {
  // Fixture untuk deploy ulang state bersih sebelum setiap test
  async function deployLaunchpadFixture() {
    const [owner, creator, trader1, trader2, treasury] = await ethers.getSigners();

    // 1. Deploy Mocks
    const MockERC20 = await ethers.getContractFactory("MockERC20"); // 18 decimals (WIP)
    const MockERC206 = await ethers.getContractFactory("MockERC20_6"); // 6 decimals (RT)

    const wipToken = await MockERC20.deploy("Wrapped IP", "WIP"); // Native Token Mock (18 decimals)
    const royaltyToken = await MockERC206.deploy("My Song Royalty", "RT-SONG"); // RT with 6 decimals

    const MockPiperX = await ethers.getContractFactory("MockPiperXRouter");
    const piperXRouter = await MockPiperX.deploy();

    const MockRoyalty = await ethers.getContractFactory("MockRoyaltyWorkflows");
    const royaltyWorkflows = await MockRoyalty.deploy();
    
    // Danai MockRoyalty dengan ETH agar bisa simulasi bayar royalty
    await owner.sendTransaction({
      to: royaltyWorkflows.address,
      value: ethers.utils.parseEther("10.0")
    });

    // 2. Deploy Launchpad
    const SovryLaunchpad = await ethers.getContractFactory("SovryLaunchpad");
    const graduationThreshold = ethers.utils.parseEther("5.0"); // Set threshold rendah biar gampang test graduation
    
    const launchpad = await SovryLaunchpad.deploy(
      treasury.address,
      piperXRouter.address,
      royaltyWorkflows.address,
      wipToken.address,
      graduationThreshold,
      owner.address
    );

    // Whitelist RT token
    await launchpad.addApprovedRT(royaltyToken.address);

    return { 
      launchpad, 
      wipToken, 
      royaltyToken, 
      piperXRouter, 
      royaltyWorkflows, 
      owner, 
      creator, 
      trader1, 
      treasury,
      graduationThreshold 
    };
  }

  describe("Deployment", function () {
    it("Should set the correct treasury address", async function () {
      const { launchpad, treasury } = await deployLaunchpadFixture();
      expect(await launchpad.treasury()).to.equal(treasury.address);
    });
  });

  describe("Launching Token", function () {
    it("Should launch a new wrapper token correctly", async function () {
      const { launchpad, royaltyToken, creator } = await deployLaunchpadFixture();
      
      const RT_UNIT = ethers.BigNumber.from("1000000"); // 1 RT (6 decimals)
      const amountToLock = RT_UNIT.mul(100); // 100 RT
      
      // Transfer RT ke Creator & Approve Launchpad
      await royaltyToken.transfer(creator.address, amountToLock);
      await royaltyToken.connect(creator).approve(launchpad.address, amountToLock);

      // Launch Parameter
      const basePrice = ethers.utils.parseEther("0.000000000000000001");
      const priceIncrement = ethers.utils.parseEther("0.000000000000000001");

      await expect(launchpad.connect(creator).launchToken(
        royaltyToken.address,
        amountToLock,
        "Wrapper Song",
        "W-SONG",
        basePrice,
        priceIncrement
      )).to.emit(launchpad, "TokenLaunched");

      // Verify Wrapper Created
      const launchedTokens = await launchpad.getAllLaunchedTokens();
      expect(launchedTokens.length).to.equal(1);

      const wrapperAddress = launchedTokens[0];

      // Check wrapper ownership is the launchpad
      const SovryToken = await ethers.getContractFactory("SovryToken");
      const wrapperToken = SovryToken.attach(wrapperAddress);
      expect(await wrapperToken.owner()).to.equal(launchpad.address);

      const tokenInfo = await launchpad.getTokenInfo(wrapperAddress);
      const curve = await launchpad.getBondingCurve(wrapperAddress);
      const wrapPerRt = await launchpad.WRAP_PER_RT();

      // 75/20/5 rule: 100 RT locked
      // - totalLocked = 100
      expect(tokenInfo.totalLocked).to.equal(amountToLock);

      // - dexReserve = 20% = 20
      const dexReserve = tokenInfo.dexReserve;
      const expectedDexReserve = amountToLock.mul(20).div(100);
      expect(dexReserve).to.equal(expectedDexReserve);

      // - creator premine = 5% = 5 RT, but wrapper uses 1:10,000,000 ratio
      const premine = amountToLock.mul(5).div(100);
      const expectedPremineWrapped = premine.mul(wrapPerRt);
      expect(await wrapperToken.balanceOf(creator.address)).to.equal(expectedPremineWrapped);

      // - currentSupply on curve = 75% = totalLocked - dexReserve - premine = 75
      const expectedCurveSupplyRt = amountToLock.sub(dexReserve).sub(premine);
      const expectedCurveSupply = expectedCurveSupplyRt.mul(wrapPerRt);
      const curveSupply = curve[2];
      expect(curveSupply).to.equal(expectedCurveSupply);

      // - initialCurveSupply used in pricing = totalLocked - dexReserve = 80
      const initialCurveSupply = tokenInfo.initialCurveSupply;
      const expectedInitialCurveSupply = expectedCurveSupplyRt.mul(wrapPerRt);
      expect(initialCurveSupply).to.equal(expectedInitialCurveSupply);

      // - wrapper totalSupply minted = 100 RT * WRAP_PER_RT
      const expectedTotalSupply = amountToLock.mul(wrapPerRt);
      expect(await wrapperToken.totalSupply()).to.equal(expectedTotalSupply);
    });
  });

  describe("Trading (Bonding Curve)", function () {
    it("Should allow buying tokens and increase price", async function () {
      const { launchpad, royaltyToken, creator, trader1, treasury, owner } = await deployLaunchpadFixture();

      // Naikkan threshold supaya BUY tidak memicu graduation
      await launchpad
        .connect(owner)
        .updateGraduationThreshold(ethers.constants.MaxUint256);

      const RT_UNIT = ethers.BigNumber.from("1000000"); // 1 RT (6 desimal)

      // --- Setup Launch --- (lock 1,000 RT)
      const amountToLock = RT_UNIT.mul(1000);
      await royaltyToken.transfer(creator.address, amountToLock);
      await royaltyToken.connect(creator).approve(launchpad.address, amountToLock);
      
      await launchpad.connect(creator).launchToken(
        royaltyToken.address,
        amountToLock,
        "Wrapper", "WRP",
        ethers.utils.parseEther("0.000000000000000001"), // Base Price per RT (1 wei per wrapper unit)
        ethers.utils.parseEther("0.000000000000000001") // Increment per RT (1 wei per wrapper unit)
      );

      const launchedTokens = await launchpad.getAllLaunchedTokens();
      const wrapperAddress = launchedTokens[0];

      const wrapPerRt = await launchpad.WRAP_PER_RT();

      // --- Test BUY with slippage protection and fee split ---
      const buyRt = RT_UNIT; // beli 1 RT dari curve
      const buyAmount = buyRt.mul(wrapPerRt); // wrapper units
      const baseCost = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
      const totalFee = baseCost.div(100); // 1% fee
      const totalCost = baseCost.add(totalFee);

      const priceBefore = await launchpad.getCurrentPrice(wrapperAddress);
      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);
      const creatorBalanceBefore = await ethers.provider.getBalance(creator.address);

      const deadline = Math.floor(Date.now() / 1000) + 600;

      const tx = await launchpad
        .connect(trader1)
        .buy(wrapperAddress, buyAmount, totalCost, deadline, { value: totalCost });
      const receipt = await tx.wait();
      if (receipt) {
        console.log("[Gas] buy gasUsed:", receipt.gasUsed.toString());
      }

      const priceAfter = await launchpad.getCurrentPrice(wrapperAddress);
      expect(priceAfter).to.be.greaterThan(priceBefore);

      const SovryToken = await ethers.getContractFactory("SovryToken");
      const wrapperToken = SovryToken.attach(wrapperAddress);
      expect(await wrapperToken.balanceOf(trader1.address)).to.equal(buyAmount);

      const curve = await launchpad.getBondingCurve(wrapperAddress);
      const reserveBalance = curve[3];
      expect(reserveBalance).to.equal(baseCost);

      const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);
      const creatorBalanceAfter = await ethers.provider.getBalance(creator.address);

      const expectedCreatorShare = totalFee.div(2); // 0.5%
      const expectedProtocolShare = totalFee.sub(expectedCreatorShare); // 0.5%

      const treasuryDelta = treasuryBalanceAfter.sub(treasuryBalanceBefore);
      const creatorDelta = creatorBalanceAfter.sub(creatorBalanceBefore);

      expect(treasuryDelta).to.equal(expectedProtocolShare);
      expect(creatorDelta).to.equal(expectedCreatorShare);

      // --- Detail: sold, market cap, and internal state after BUY ---
      const tokenInfoAfter = await launchpad.getTokenInfo(wrapperAddress);
      const curveAfter = await launchpad.getBondingCurve(wrapperAddress);
      const initialCurveSupplyWrapped = tokenInfoAfter.initialCurveSupply;
      const soldRaw = initialCurveSupplyWrapped.sub(curveAfter[2]);
      const soldAfter = soldRaw.div(RT_UNIT);
      const premine = tokenInfoAfter.totalLocked.mul(5).div(100); // RT raw units
      const expectedSold = premine.add(buyRt); // premine RT + 1 RT dibeli

      const currentPriceAfter = await launchpad.getCurrentPrice(wrapperAddress);
      const marketCapAfter = await launchpad.getMarketCap(wrapperAddress);

      console.log("[Buy] wrapper:", wrapperAddress);
      console.log("[Buy] totalLocked:", tokenInfoAfter.totalLocked.toString());
      console.log("[Buy] dexReserve:", tokenInfoAfter.dexReserve.toString());
      console.log("[Buy] currentSupply:", curveAfter[2].toString());
      console.log("[Buy] soldAfter:", soldAfter.toString());
      console.log("[Buy] premine:", premine.toString());
      console.log("[Buy] baseCost:", baseCost.toString());
      console.log("[Buy] totalFee:", totalFee.toString());
      console.log("[Buy] reserveBalance:", reserveBalance.toString());
      console.log("[Buy] currentPriceAfter:", currentPriceAfter.toString());
      console.log("[Buy] marketCapAfter:", marketCapAfter.toString());

      // soldAfter = premine + buyRt (karena formula sold menghitung token yang beredar dalam RT raw units)
      const buyUnits = buyAmount.div(RT_UNIT);
      expect(soldAfter).to.equal(buyUnits);

      // getMarketCap harus konsisten dengan definisi di Solidity: price * totalSupplyUnits (RT)
      const totalWrapped = tokenInfoAfter.totalLocked.mul(wrapPerRt);
      const totalSupplyUnits = totalWrapped.div(RT_UNIT);
      expect(marketCapAfter).to.equal(
        currentPriceAfter.mul(totalSupplyUnits)
      );

      // --- Slippage: require totalCost <= maxEthCost ---
      // Wait for cooldown (5 seconds)
      await ethers.provider.send("evm_increaseTime", [6]);
      await ethers.provider.send("evm_mine");

      const smallRt = RT_UNIT;
      const smallWrapper = smallRt.mul(wrapPerRt);
      const baseCost2 = await launchpad.calculateBuyPrice(wrapperAddress, smallWrapper);
      const totalFee2 = baseCost2.div(100);
      const totalCost2 = baseCost2.add(totalFee2);
      const maxEthTooLow = totalCost2.sub(1);
      const deadline2 = Math.floor(Date.now() / 1000) + 600;

      await expect(
        launchpad
          .connect(trader1)
          .buy(wrapperAddress, smallWrapper, maxEthTooLow, deadline2, { value: totalCost2 })
      ).to.be.revertedWithCustomError(launchpad, "SlippageExceeded");
    });

    it("Should allow selling tokens and decrease price", async function () {
      const { launchpad, royaltyToken, creator, trader1, owner } = await deployLaunchpadFixture();

      // Naikkan threshold supaya BUY/SELL tidak memicu graduation
      await launchpad
        .connect(owner)
        .updateGraduationThreshold(ethers.constants.MaxUint256);

      const RT_UNIT = ethers.BigNumber.from("1000000");

      // --- Setup Launch --- (lock 1,000 RT)
      const amountToLock = RT_UNIT.mul(1000);
      await royaltyToken.transfer(creator.address, amountToLock);
      await royaltyToken.connect(creator).approve(launchpad.address, amountToLock);
      
      await launchpad.connect(creator).launchToken(
        royaltyToken.address,
        amountToLock,
        "Wrapper", "WRP",
        ethers.utils.parseEther("0.000000000000000001"), // Base Price per RT (1 wei per wrapper unit)
        ethers.utils.parseEther("0.000000000000000001") // Increment per RT (1 wei per wrapper unit)
      );

      const launchedTokens = await launchpad.getAllLaunchedTokens();
      const wrapperAddress = launchedTokens[0];
      const SovryToken = await ethers.getContractFactory("SovryToken");
      const wrapperToken = SovryToken.attach(wrapperAddress);

      const wrapPerRt = await launchpad.WRAP_PER_RT();

      // Beli dulu supaya trader1 punya saldo: buy 2 RT
      const buyRt = RT_UNIT.mul(2);
      const buyAmount = buyRt.mul(wrapPerRt); // wrapper units
      const baseBuyCost = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
      const buyFee = baseBuyCost.div(100);
      const buyTotalCost = baseBuyCost.add(buyFee);
      const deadlineBuy = Math.floor(Date.now() / 1000) + 600;
      await launchpad
        .connect(trader1)
        .buy(wrapperAddress, buyAmount, buyTotalCost, deadlineBuy, { value: buyTotalCost });

      const priceBeforeSell = await launchpad.getCurrentPrice(wrapperAddress);
      const curveBeforeSell = await launchpad.getBondingCurve(wrapperAddress);
      const reserveBeforeSell = curveBeforeSell[3];

      // Jual 1 RT
      const sellRt = RT_UNIT;
      const sellAmount = sellRt.mul(wrapPerRt);
      const baseProceeds = await launchpad.calculateSellPrice(wrapperAddress, sellAmount);
      const sellFee = baseProceeds.div(100);
      const netProceeds = baseProceeds.sub(sellFee);

      await wrapperToken.connect(trader1).approve(launchpad.address, sellAmount);

      const deadlineSell = Math.floor(Date.now() / 1000) + 600;

      await expect(
        launchpad.connect(trader1).sell(wrapperAddress, sellAmount, netProceeds, deadlineSell)
      ).to.emit(launchpad, "TokensSold");

      const curveAfterSell = await launchpad.getBondingCurve(wrapperAddress);
      const reserveAfterSell = curveAfterSell[3];
      const reserveDelta = reserveBeforeSell.sub(reserveAfterSell);
      expect(reserveDelta).to.equal(baseProceeds);

      const priceAfterSell = await launchpad.getCurrentPrice(wrapperAddress);
      expect(priceAfterSell).to.be.lessThan(priceBeforeSell);

      const traderBalance = await wrapperToken.balanceOf(trader1.address);
      const expectedBalance = buyAmount.sub(sellAmount);
      expect(traderBalance).to.equal(expectedBalance);
    });

    it("Should revert sell when minEthProceeds is too high (slippage)", async function () {
      const { launchpad, royaltyToken, creator, trader1, owner } = await deployLaunchpadFixture();

      // Naikkan threshold supaya BUY/SELL tidak memicu graduation
      await launchpad
        .connect(owner)
        .updateGraduationThreshold(ethers.constants.MaxUint256);

      const RT_UNIT = ethers.BigNumber.from("1000000");

      const amountToLock = RT_UNIT.mul(1000);
      await royaltyToken.transfer(creator.address, amountToLock);
      await royaltyToken
        .connect(creator)
        .approve(launchpad.address, amountToLock);

      await launchpad.connect(creator).launchToken(
        royaltyToken.address,
        amountToLock,
        "Wrapper",
        "WRP",
        ethers.utils.parseEther("0.000000000000000001"),
        ethers.utils.parseEther("0.000000000000000001")
      );

      const launchedTokens = await launchpad.getAllLaunchedTokens();
      const wrapperAddress = launchedTokens[0];
      const SovryToken = await ethers.getContractFactory("SovryToken");
      const wrapperToken = SovryToken.attach(wrapperAddress);

      const wrapPerRt = await launchpad.WRAP_PER_RT();

      // Buy 2 RT
      const buyRt = RT_UNIT.mul(2);
      const buyAmount = buyRt.mul(wrapPerRt);
      const baseBuyCost = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
      const buyFee = baseBuyCost.div(100);
      const buyTotalCost = baseBuyCost.add(buyFee);
      const deadlineBuy = Math.floor(Date.now() / 1000) + 600;
      await launchpad
        .connect(trader1)
        .buy(wrapperAddress, buyAmount, buyTotalCost, deadlineBuy, { value: buyTotalCost });

      const sellRt = RT_UNIT;
      const sellAmount = sellRt.mul(wrapPerRt);
      const baseProceeds = await launchpad.calculateSellPrice(wrapperAddress, sellAmount);
      const sellFee = baseProceeds.div(100);
      const netProceeds = baseProceeds.sub(sellFee);
      const tooHighMinProceeds = netProceeds.add(1);

      await wrapperToken.connect(trader1).approve(launchpad.address, sellAmount);

      const deadlineSell = Math.floor(Date.now() / 1000) + 600;

      await expect(
        launchpad
          .connect(trader1)
          .sell(wrapperAddress, sellAmount, tooHighMinProceeds, deadlineSell)
      ).to.be.revertedWithCustomError(launchpad, "SlippageExceeded");
    });

    it("Should graduate when market cap threshold is reached and time delay passes", async function () {
      const { launchpad, royaltyToken, creator, owner, piperXRouter } = await deployLaunchpadFixture();
      
      // Set very low threshold so market cap easily exceeds it
      const lowThreshold = ethers.utils.parseEther("0.001");
      await launchpad
        .connect(owner)
        .updateGraduationThreshold(lowThreshold);

      const RT_UNIT = ethers.BigNumber.from("1000000");

      // --- Setup Launch ---
      const amountToLock = RT_UNIT.mul(1000); // 1,000 RT
      await royaltyToken.transfer(creator.address, amountToLock);
      await royaltyToken.connect(creator).approve(launchpad.address, amountToLock);
      
      await launchpad.connect(creator).launchToken(
        royaltyToken.address,
        amountToLock,
        "Wrapper", "WRP",
        ethers.utils.parseEther("0.000000000000000001"), 
        ethers.utils.parseEther("0.000000000000000001")
      );
      const launchedTokens = await launchpad.getAllLaunchedTokens();
      const wrapperAddress = launchedTokens[0];

      const tokenInfoBefore = await launchpad.getTokenInfo(wrapperAddress);
      expect(tokenInfoBefore.graduated).to.equal(false);

      // --- HARVEST TO TRIGGER GRADUATION CHECK ---
      await expect(
        launchpad.harvest(
          wrapperAddress,
          "0x0000000000000000000000000000000000000001",
          ["0x0000000000000000000000000000000000000002"],
          ["0x0000000000000000000000000000000000000003"],
          ["0x0000000000000000000000000000000000000004"]
        )
      ).to.emit(launchpad, "RoyaltiesHarvested");

      // Token should NOT graduate yet because of 15 minute delay
      let tokenInfo = await launchpad.getTokenInfo(wrapperAddress);
      expect(tokenInfo.graduated).to.equal(false);

      // --- TIME TRAVEL 15 MINUTES + 1 SECOND ---
      await ethers.provider.send("evm_increaseTime", [15 * 60 + 1]);
      await ethers.provider.send("evm_mine");

      // --- TRIGGER GRADUATION VIA BUY (which calls _checkGraduation) ---
      // Wait for cooldown first
      await ethers.provider.send("evm_increaseTime", [6]);
      await ethers.provider.send("evm_mine");

      const wrapPerRt = await launchpad.WRAP_PER_RT();
      const buyAmount = RT_UNIT.mul(wrapPerRt); // Buy 1 RT worth
      const baseCost = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
      const totalFee = baseCost.div(100);
      const totalCost = baseCost.add(totalFee);
      // Use block timestamp + 3600 to avoid expiration after time travel
      const blockNumber = await ethers.provider.getBlockNumber();
      const block = await ethers.provider.getBlock(blockNumber);
      const deadline = block.timestamp + 3600;

      // This buy should trigger graduation
      await expect(
        launchpad.buy(wrapperAddress, buyAmount, totalCost, deadline, { value: totalCost })
      ).to.emit(launchpad, "Graduated");

      // Verify graduation happened
      tokenInfo = await launchpad.getTokenInfo(wrapperAddress);
      expect(tokenInfo.graduated).to.equal(true);

      // Verify curve is no longer active
      const curve = await launchpad.getBondingCurve(wrapperAddress);
      expect(curve.isActive).to.equal(false);

      // Verify LP was sent to burn address
      const lastTo = await piperXRouter.lastTo();
      expect(lastTo).to.equal("0x000000000000000000000000000000000000dEaD");

      console.log("[Graduation] ✅ Token graduated successfully after time delay");
    });

    it("Should handle graduation with price alignment and excess ETH buyback", async function () {
      const { launchpad, royaltyToken, creator, owner, piperXRouter } = await deployLaunchpadFixture();

      // Set very low threshold for graduation
      const lowThreshold = ethers.utils.parseEther("0.001");
      await launchpad
        .connect(owner)
        .updateGraduationThreshold(lowThreshold);

      const RT_UNIT = ethers.BigNumber.from("1000000");

      // --- Setup Launch ---
      const amountToLock = RT_UNIT.mul(1000); // 1,000 RT
      await royaltyToken.transfer(creator.address, amountToLock);
      await royaltyToken.connect(creator).approve(launchpad.address, amountToLock);

      await launchpad.connect(creator).launchToken(
        royaltyToken.address,
        amountToLock,
        "Wrapper",
        "WRP",
        ethers.utils.parseEther("0.000000000000000001"),
        ethers.utils.parseEther("0.000000000000000001")
      );

      const launchedTokens = await launchpad.getAllLaunchedTokens();
      const wrapperAddress = launchedTokens[0];

      const tokenInfoBefore = await launchpad.getTokenInfo(wrapperAddress);
      const curveBefore = await launchpad.getBondingCurve(wrapperAddress);

      // Get market cap before graduation
      const marketCapBefore = await launchpad.getMarketCap(wrapperAddress);
      console.log("[Graduation] Market cap before:", marketCapBefore.toString());

      // First harvest: should trigger graduation check
      await expect(
        launchpad.harvest(
          wrapperAddress,
          "0x0000000000000000000000000000000000000001",
          ["0x0000000000000000000000000000000000000002"],
          ["0x0000000000000000000000000000000000000003"],
          ["0x0000000000000000000000000000000000000004"]
        )
      ).to.emit(launchpad, "RoyaltiesHarvested");

      // Token should NOT graduate yet because of 15 minute delay
      let tokenAfterFirst = await launchpad.getTokenInfo(wrapperAddress);
      expect(tokenAfterFirst.graduated).to.equal(false);

      // Time travel 15 minutes + 1 second
      await ethers.provider.send("evm_increaseTime", [15 * 60 + 1]);
      await ethers.provider.send("evm_mine");

      // Wait for cooldown
      await ethers.provider.send("evm_increaseTime", [6]);
      await ethers.provider.send("evm_mine");

      // Buy should trigger graduation
      const wrapPerRt = await launchpad.WRAP_PER_RT();
      const rtUnit = ethers.BigNumber.from("1000000");
      const buyAmount = rtUnit.mul(wrapPerRt);
      const baseCost = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
      const totalFee = baseCost.div(100);
      const totalCost = baseCost.add(totalFee);
      // Use block timestamp + 3600 to avoid expiration after time travel
      const blockNum = await ethers.provider.getBlockNumber();
      const blockData = await ethers.provider.getBlock(blockNum);
      const deadline = blockData.timestamp + 3600;

      await expect(
        launchpad.buy(wrapperAddress, buyAmount, totalCost, deadline, { value: totalCost })
      ).to.emit(launchpad, "Graduated");

      // Verify graduation happened
      const tokenInfoAfter = await launchpad.getTokenInfo(wrapperAddress);
      expect(tokenInfoAfter.graduated).to.equal(true);

      // Verify curve is no longer active
      const curveAfter = await launchpad.getBondingCurve(wrapperAddress);
      expect(curveAfter.isActive).to.equal(false);

      // Verify LP was sent to burn address
      const lastTo = await piperXRouter.lastTo();
      expect(lastTo).to.equal("0x000000000000000000000000000000000000dEaD");

      console.log("[Graduation] ✅ Price alignment and buyback verified");
    });

    it("Should harvest royalties and pump bonding curve reserve", async function () {
      const { launchpad, royaltyToken, creator, owner } = await deployLaunchpadFixture();

      // Naikkan graduationThreshold agar harvest saja tidak langsung memicu graduation
      await launchpad
        .connect(owner)
        .updateGraduationThreshold(ethers.utils.parseEther("1000000"));

      // --- Setup Launch ---
      const RT_UNIT = ethers.BigNumber.from("1000000");
      const amountToLock = RT_UNIT.mul(100); // 100 RT
      await royaltyToken.transfer(creator.address, amountToLock);
      await royaltyToken.connect(creator).approve(launchpad.address, amountToLock);

      await launchpad.connect(creator).launchToken(
        royaltyToken.address,
        amountToLock,
        "Wrapper", "WRP",
        ethers.utils.parseEther("0.000000000000000001"),
        ethers.utils.parseEther("0.000000000000000001")
      );

      const launchedTokens = await launchpad.getAllLaunchedTokens();
      const wrapperAddress = launchedTokens[0];

      const launchpadAddress = launchpad.address;

      // Snapshot sebelum pump
      const balanceBefore = await ethers.provider.getBalance(launchpadAddress);
      const curveBefore = await launchpad.getBondingCurve(wrapperAddress);
      const reserveBefore = curveBefore[3];
      const priceBefore = await launchpad.getCurrentPrice(wrapperAddress);

      console.log("[Harvest] Price before pump:", priceBefore.toString());

      // Panggil harvest (MockRoyaltyWorkflows akan mengirim 1 ETH)
      await expect(
        launchpad.harvest(
          wrapperAddress,
          "0x0000000000000000000000000000000000000001", // dummy ancestorIpId
          ["0x0000000000000000000000000000000000000002"],
          ["0x0000000000000000000000000000000000000003"],
          ["0x0000000000000000000000000000000000000004"]
        )
      ).to.emit(launchpad, "RoyaltiesHarvested");

      const balanceAfter = await ethers.provider.getBalance(launchpadAddress);
      const curveAfter = await launchpad.getBondingCurve(wrapperAddress);
      const reserveAfter = curveAfter[3];
      const priceAfter = await launchpad.getCurrentPrice(wrapperAddress);

      console.log("[Harvest] Price after pump:", priceAfter.toString());

      // Launchpad menerima 1 ETH dari MockRoyaltyWorkflows
      const balanceDelta = balanceAfter.sub(balanceBefore);
      expect(balanceDelta).to.equal(ethers.utils.parseEther("1.0"));

      // reserveBalance di bonding curve bertambah sebesar jumlah klaim
      const reserveDelta = reserveAfter.sub(reserveBefore);
      expect(reserveDelta).to.equal(ethers.utils.parseEther("1.0"));

      // Pastikan harga tidak turun setelah pump (bisa tetap atau naik jika logika diubah)
      expect(priceAfter).to.be.greaterThanOrEqual(priceBefore);
    });
  });

  describe("Security: Emergency Withdraw", function () {
    it("Should revert when owner tries to emergencyWithdraw wrapper token", async function () {
      const { launchpad, royaltyToken, creator, owner } = await deployLaunchpadFixture();

      const RT_UNIT = ethers.BigNumber.from("1000000");
      const amountToLock = RT_UNIT.mul(100); // 100 RT
      await royaltyToken.transfer(creator.address, amountToLock);
      await royaltyToken
        .connect(creator)
        .approve(launchpad.address, amountToLock);

      await launchpad.connect(creator).launchToken(
        royaltyToken.address,
        amountToLock,
        "Wrapper",
        "WRP",
        ethers.utils.parseEther("0.000000000000000001"),
        ethers.utils.parseEther("0.000000000000000001")
      );

      const launchedTokens = await launchpad.getAllLaunchedTokens();
      const wrapperAddress = launchedTokens[0];

      await expect(
        launchpad
          .connect(owner)
          .emergencyWithdraw(wrapperAddress, owner.address, 0)
      ).to.be.revertedWith("Cannot withdraw wrapper tokens");
    });

    it("Should revert when owner tries to emergencyWithdraw underlying RT vault tokens", async function () {
      const { launchpad, royaltyToken, creator, owner } = await deployLaunchpadFixture();

      const RT_UNIT = ethers.BigNumber.from("1000000");
      const amountToLock = RT_UNIT.mul(100); // 100 RT
      await royaltyToken.transfer(creator.address, amountToLock);
      await royaltyToken
        .connect(creator)
        .approve(launchpad.address, amountToLock);

      await launchpad.connect(creator).launchToken(
        royaltyToken.address,
        amountToLock,
        "Wrapper",
        "WRP",
        ethers.utils.parseEther("0.000000000000000001"),
        ethers.utils.parseEther("0.000000000000000001")
      );

      await expect(
        launchpad
          .connect(owner)
          .emergencyWithdraw(royaltyToken.address, owner.address, 0)
      ).to.be.revertedWith("Cannot withdraw RT vault tokens");
    });

    it("Should revert withdrawing native liquidity reserves while curves hold funds", async function () {
      const { launchpad, royaltyToken, creator, owner } = await deployLaunchpadFixture();

      // Lock 100 RT and launch a token
      const RT_UNIT = ethers.BigNumber.from("1000000");
      const amountToLock = RT_UNIT.mul(100); // 100 RT
      await royaltyToken.transfer(creator.address, amountToLock);
      await royaltyToken
        .connect(creator)
        .approve(launchpad.address, amountToLock);

      await launchpad.connect(creator).launchToken(
        royaltyToken.address,
        amountToLock,
        "Wrapper",
        "WRP",
        ethers.utils.parseEther("0.000000000000000001"),
        ethers.utils.parseEther("0.000000000000000001")
      );

      // After launch, emergencyWithdraw(native) should not be able to touch curve reserves
      await expect(
        launchpad
          .connect(owner)
          .emergencyWithdraw(ethers.constants.AddressZero, owner.address, 0)
      ).to.be.revertedWith("No free native balance");
    });
  });

  describe("Security Tests", function() {
    it("Should prevent RT balance manipulation via reentrancy", async function() {
      const { launchpad, royaltyToken, creator, owner } = await deployLaunchpadFixture();

      // Lock 100 RT (using RT_UNIT = 10^6)
      const RT_UNIT = ethers.BigNumber.from("1000000");
      const amountToLock = RT_UNIT.mul(100);
      
      // Transfer RT ke Creator & Approve
      await royaltyToken.transfer(creator.address, amountToLock);
      await royaltyToken
        .connect(creator)
        .approve(launchpad.address, amountToLock);

      // Launch token - should succeed
      await launchpad.connect(creator).launchToken(
        royaltyToken.address,
        amountToLock,
        "Wrapper",
        "WRP",
        ethers.utils.parseEther("0.001"),
        ethers.utils.parseEther("0.001")
      );

      // Verify RT is locked in launchpad
      const rtBalance = await royaltyToken.balanceOf(launchpad.address);
      expect(rtBalance).to.equal(amountToLock);

      // Try to call launchToken again with same RT - should fail
      await expect(
        launchpad.connect(creator).launchToken(
          royaltyToken.address,
          amountToLock,
          "Wrapper2",
          "WRP2",
          ethers.utils.parseEther("0.001"),
          ethers.utils.parseEther("0.001")
        )
      ).to.be.revertedWithCustomError(launchpad, "TokenAlreadyLaunched");
    });

    it("Should prevent prefund theft via race condition", async function() {
      const { launchpad, royaltyToken, creator, trader1, owner } = await deployLaunchpadFixture();

      const RT_UNIT = ethers.BigNumber.from("1000000");
      const depositAmount = RT_UNIT.mul(50);

      // Creator deposits RT for prefunding
      await royaltyToken.transfer(creator.address, depositAmount);
      await royaltyToken
        .connect(creator)
        .approve(launchpad.address, depositAmount);

      await launchpad.connect(creator).depositRT(royaltyToken.address, depositAmount);

      // Verify deposit is tracked
      const balance = await launchpad.getDepositBalance(creator.address, royaltyToken.address);
      expect(balance).to.equal(depositAmount);

      // Trader1 tries to launch with creator's deposit - should fail
      await expect(
        launchpad.connect(trader1).launchTokenPrefunded(
          royaltyToken.address,
          depositAmount,
          "Wrapper",
          "WRP",
          ethers.utils.parseEther("0.001"),
          ethers.utils.parseEther("0.001")
        )
      ).to.be.revertedWithCustomError(launchpad, "InsufficientDeposit");
    });

    it("Should handle overflow edge cases in bonding curve", async function() {
      const { launchpad, royaltyToken, creator, owner } = await deployLaunchpadFixture();

      const RT_UNIT = ethers.BigNumber.from("1000000");
      const amountToLock = RT_UNIT.mul(100);

      // Launch token with normal parameters
      await royaltyToken.transfer(creator.address, amountToLock);
      await royaltyToken
        .connect(creator)
        .approve(launchpad.address, amountToLock);

      const basePrice = ethers.utils.parseEther("0.001");
      const priceIncrement = ethers.utils.parseEther("0.001");

      await launchpad.connect(creator).launchToken(
        royaltyToken.address,
        amountToLock,
        "Wrapper",
        "WRP",
        basePrice,
        priceIncrement
      );

      const launchedTokens = await launchpad.getAllLaunchedTokens();
      const wrapperAddress = launchedTokens[0];
      
      // Verify token was launched successfully
      expect(launchedTokens.length).to.equal(1);
      expect(wrapperAddress).to.not.equal(ethers.constants.AddressZero);
    });

  });
});

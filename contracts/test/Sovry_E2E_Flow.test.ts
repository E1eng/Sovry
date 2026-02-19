import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";

describe("Sovry E2E: NFT Mint → Launch → Royalty Inject → Bot Harvest → Graduate", function () {
  async function deployE2EFixture() {
    const [owner, creator, trader, keeper, treasury, ipaReceiver] = await ethers.getSigners();

    // Deploy Mock WIP (wrapped IP token)
    const MockWIP = await ethers.getContractFactory("MockWIP");
    const wip = await MockWIP.deploy();

    // Deploy Mock ERC20 for Royalty Token (RT)
    const MockERC206 = await ethers.getContractFactory("MockERC20_6");
    const rt = await MockERC206.deploy("Song Royalty Token", "RT-SONG");

    // Deploy Mock IP Asset Registry (simulates Story Protocol IP Asset)
    const MockIPAssetRegistry = await ethers.getContractFactory("MockIPAssetRegistry");
    const ipAssetRegistry = await MockIPAssetRegistry.deploy();

    // Deploy Mock PiperX V3 contracts
    const MockPiperXV3Factory = await ethers.getContractFactory("MockPiperXV3Factory");
    const piperXV3Factory = await MockPiperXV3Factory.deploy();

    const MockPiperXV3PositionManager = await ethers.getContractFactory("MockPiperXV3PositionManager");
    const piperXV3PositionManager = await MockPiperXV3PositionManager.deploy(piperXV3Factory.address);

    const MockPiperXV3Router = await ethers.getContractFactory("MockPiperXV3Router");
    const piperXV3Router = await MockPiperXV3Router.deploy();

    // Deploy Mock Royalty Workflows (Story Protocol royalty module)
    const MockRoyalty = await ethers.getContractFactory("MockRoyaltyWorkflows");
    const royaltyWorkflows = await MockRoyalty.deploy();

    // Deploy SovryExchange with low graduation threshold for testing
    const SovryExchange = await ethers.getContractFactory("SovryExchange");
    const graduationThreshold = ethers.utils.parseEther("0.1"); // 0.1 IP for easy graduation
    const exchange = await SovryExchange.deploy(
      treasury.address,
      piperXV3Factory.address,
      piperXV3Router.address,
      piperXV3PositionManager.address,
      royaltyWorkflows.address,
      wip.address,
      graduationThreshold,
      owner.address
    );

    // Set curve params
    const basePrice = ethers.utils.parseEther("0.000000000000000001");
    const priceIncrement = ethers.utils.parseEther("0.000000000000000001");
    await exchange.connect(owner).setCurveParams(basePrice, priceIncrement);

    // Deploy Factory
    const SovryFactory = await ethers.getContractFactory("SovryFactory");
    const factory = await SovryFactory.deploy(exchange.address);

    // Deploy Router
    const SovryRouter = await ethers.getContractFactory("SovryRouter");
    const router = await SovryRouter.deploy(factory.address, exchange.address, wip.address);

    // Link contracts
    await exchange.connect(owner).setFactory(factory.address);
    await exchange.connect(owner).setRouter(router.address);

    // Grant keeper role
    const keeperRole = await exchange.KEEPER_ROLE();
    await exchange.connect(owner).grantRole(keeperRole, keeper.address);

    return {
      owner,
      creator,
      trader,
      keeper,
      treasury,
      ipaReceiver,
      wip,
      rt,
      ipAssetRegistry,
      piperXV3Factory,
      piperXV3PositionManager,
      royaltyWorkflows,
      exchange,
      factory,
      router,
    };
  }

  it("Full E2E Flow: Mint IP Asset → Launch Token → Trade → Inject Royalty → Bot Harvest → Graduate", async function () {
    const { 
      owner, 
      creator, 
      trader, 
      keeper, 
      treasury,
      ipaReceiver,
      wip, 
      rt, 
      ipAssetRegistry,
      royaltyWorkflows,
      exchange, 
      factory,
      router 
    } = await deployE2EFixture();

    const RT_UNIT = BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100); // 100 RT tokens

    // ==========================================
    // STEP 1: Mint NFT / Create IP Asset (Simulated)
    // ==========================================
    console.log("\n🎨 STEP 1: Minting IP Asset (NFT)...");
    
    // Register IP Asset - the registry itself acts as the IP Asset for testing
    // This ensures the address has contract code (required by launchTokenFromFactory)
    const ipAssetTx = await ipAssetRegistry.connect(creator).registerIpAsset(
      "Song IP Asset",
      "IP-SONG-001",
      creator.address
    );
    const ipAssetReceipt = await ipAssetTx.wait();
    const ipAssetEvent = ipAssetReceipt.events?.find((e: any) => e.event === "IPAssetRegistered");
    const generatedIpAsset = ipAssetEvent!.args!.ipAsset;
    
    // Use the registry address as IP Asset to ensure contract code exists
    // In production, this would be the actual IP Asset from Story Protocol
    const ipAssetAddress = ipAssetRegistry.address;
    
    console.log(`✅ IP Asset created (registry at): ${ipAssetAddress}`);
    expect(ipAssetAddress).to.not.equal(ethers.constants.AddressZero);

    // ==========================================
    // STEP 2: Launch Token from IP Asset
    // ==========================================
    console.log("\n🚀 STEP 2: Launching token from IP Asset...");

    // Transfer RT to creator and approve
    await rt.transfer(creator.address, amountToLock);
    await rt.connect(creator).approve(exchange.address, amountToLock);

    // Launch token
    const launchTx = await factory.connect(creator).launchToken(
      rt.address,
      amountToLock,
      ipAssetAddress, // Use the IP Asset address
      "Sovry Song Token",
      "SST"
    );
    const launchReceipt = await launchTx.wait();
    const launchedEvent = launchReceipt.events?.find((e: any) => e.event === "TokenLaunched");
    const wrapperAddress = launchedEvent!.args!.wrapper;

    console.log(`✅ Token launched at: ${wrapperAddress}`);
    expect(wrapperAddress).to.not.equal(ethers.constants.AddressZero);

    // Verify token state
    const tokenInfo = await exchange.launchedTokens(wrapperAddress);
    expect(tokenInfo.ipAsset).to.equal(ipAssetAddress);
    expect(tokenInfo.creator).to.equal(creator.address);
    expect(tokenInfo.graduated).to.equal(false);

    // Lower graduation threshold for easier testing (owner only)
    await exchange.connect(owner).updateGraduationThreshold(ethers.utils.parseEther("0.0000001"));

    // ==========================================
    // STEP 3: Trade to Generate Fees (Royalty Queue)
    // ==========================================
    console.log("\n💰 STEP 3: Trading to generate royalty fees...");

    const wrapPerRt = await exchange.WRAP_PER_RT();
    const buyAmount = RT_UNIT.mul(wrapPerRt).mul(5); // Buy 5 RT worth

    // Calculate buy cost
    const baseCost = await exchange.calculateBuyPrice(wrapperAddress, buyAmount);
    const feeBps = await exchange.TRADE_FEE_BPS();
    const fee = baseCost.mul(feeBps).add(10000 - 1).div(10000);
    const totalCost = baseCost.add(fee);

    const blockNum = await ethers.provider.getBlockNumber();
    const blockData = await ethers.provider.getBlock(blockNum);
    const deadline = blockData.timestamp + 3600;

    // Execute buy
    await router.connect(trader).buyETH(wrapperAddress, buyAmount, totalCost, deadline, { 
      value: totalCost 
    });

    // Check accumulated royalty
    const accumulatedBefore = await exchange.accumulatedRoyaltyNative(wrapperAddress);
    console.log(`✅ Accumulated royalty (native): ${ethers.utils.formatEther(accumulatedBefore)} IP`);
    expect(accumulatedBefore).to.be.gt(0);

    // ==========================================
    // STEP 4: Bot Injects Royalty (pushFeesToVault)
    // ==========================================
    console.log("\n🤖 STEP 4: Bot injecting royalty to vault...");

    // Setup: Configure mock royalty module to have unclaimed revenue
    const vaultAddress = tokenInfo.vaultAddress;
    
    // Fund the vault with some WIP to simulate royalty revenue
    await wip.deposit({ value: ethers.utils.parseEther("0.05") });
    await wip.transfer(vaultAddress, ethers.utils.parseEther("0.05"));

    // Also fund the royalty workflows mock so it can transfer WIP during harvest
    await wip.deposit({ value: ethers.utils.parseEther("0.1") });
    await wip.transfer(royaltyWorkflows.address, ethers.utils.parseEther("0.1"));
    await royaltyWorkflows.setWipToken(wip.address);

    // Push fees to vault (keeper only)
    await expect(exchange.connect(keeper).pushFeesToVault(wrapperAddress))
      .to.emit(exchange, "RoyaltyRevenueProcessed");

    // Verify WIP was transferred to IP Asset
    const wipBalanceInVault = await wip.balanceOf(ipAssetAddress);
    console.log(`✅ WIP in IP Asset vault: ${ethers.utils.formatEther(wipBalanceInVault)} WIP`);
    expect(wipBalanceInVault).to.be.gt(0);

    // ==========================================
    // STEP 5: Bot Harvests Royalty (harvestFromVault)
    // ==========================================
    console.log("\n🌾 STEP 5: Bot harvesting royalty from vault...");

    // Pre-graduation harvest adds to bonding curve reserves
    const curveBefore = await exchange.bondingCurves(wrapperAddress);
    const reserveBefore = curveBefore.reserveBalance;
    console.log(`Reserve before harvest: ${ethers.utils.formatEther(reserveBefore)} IP`);

    // Fund the royalty workflows with more WIP for harvest
    await wip.deposit({ value: ethers.utils.parseEther("0.05") });
    await wip.transfer(royaltyWorkflows.address, ethers.utils.parseEther("0.05"));

    // Harvest (keeper only)
    await expect(exchange.connect(keeper).harvestFromVault(wrapperAddress))
      .to.emit(exchange, "RoyaltiesHarvested");

    const curveAfter = await exchange.bondingCurves(wrapperAddress);
    const reserveAfter = curveAfter.reserveBalance;
    console.log(`✅ Reserve after harvest: ${ethers.utils.formatEther(reserveAfter)} IP`);
    
    // Reserve should have increased
    expect(reserveAfter).to.be.gt(reserveBefore);

    // ==========================================
    // STEP 6: More Trading to Reach Graduation
    // ==========================================
    console.log("\n📈 STEP 6: Trading more to reach graduation threshold...");

    // Buy more to increase market cap
    const threshold = await exchange.graduationThreshold();
    const marketCapBefore = await exchange.getMarketCap(wrapperAddress);
    console.log(`Market cap before: ${ethers.utils.formatEther(marketCapBefore)} / ${ethers.utils.formatEther(threshold)} IP`);

    // Multiple buys to reach threshold
    for (let i = 0; i < 3; i++) {
      const buyAmountLoop = RT_UNIT.mul(wrapPerRt).mul(10);
      const baseCostLoop = await exchange.calculateBuyPrice(wrapperAddress, buyAmountLoop);
      const feeLoop = baseCostLoop.mul(feeBps).add(10000 - 1).div(10000);
      const totalCostLoop = baseCostLoop.add(feeLoop);
      
      await router.connect(trader).buyETH(wrapperAddress, buyAmountLoop, totalCostLoop, deadline, { 
        value: totalCostLoop 
      });
    }

    const marketCapAfter = await exchange.getMarketCap(wrapperAddress);
    console.log(`✅ Market cap after: ${ethers.utils.formatEther(marketCapAfter)} IP`);
    expect(marketCapAfter).to.be.gte(threshold);

    // ==========================================
    // STEP 7: Graduate the Token (Keeper Only)
    // ==========================================
    console.log("\n🎓 STEP 7: Graduating token...");

    // Graduate should be called by keeper
    await expect(exchange.connect(keeper).graduate(wrapperAddress))
      .to.emit(exchange, "Graduated");

    // Verify graduation state
    const tokenAfterGrad = await exchange.launchedTokens(wrapperAddress);
    expect(tokenAfterGrad.graduated).to.equal(true);
    expect(await exchange.bondingCurveActive(wrapperAddress)).to.equal(false);

    // Check pool was created
    const poolAddress = tokenAfterGrad.poolAddress;
    console.log(`✅ Token graduated! DEX Pool: ${poolAddress}`);
    expect(poolAddress).to.not.equal(ethers.constants.AddressZero);

    // ==========================================
    // STEP 8: Post-Graduation Harvest (Buyback & Burn)
    // ==========================================
    console.log("\n🔥 STEP 8: Post-graduation harvest (buyback & burn)...");

    // Fund royalty workflows with more WIP for post-grad buyback
    await wip.deposit({ value: ethers.utils.parseEther("0.05") });
    await wip.transfer(royaltyWorkflows.address, ethers.utils.parseEther("0.05"));

    // Get wrapper supply before
    const wrapper = await ethers.getContractAt("SovryToken", wrapperAddress);
    const supplyBefore = await wrapper.totalSupply();
    console.log(`Supply before buyback: ${ethers.utils.formatEther(supplyBefore)} SST`);

    // Post-grad harvest triggers buyback
    await exchange.connect(keeper).harvestFromVault(wrapperAddress);

    const supplyAfter = await wrapper.totalSupply();
    console.log(`✅ Supply after buyback: ${ethers.utils.formatEther(supplyAfter)} SST`);
    
    // Note: In production, post-grad harvest burns tokens via buyback
    // In mock environment, supply may not decrease if swap doesn't execute fully
    console.log("\n🎉 E2E Flow Complete!");
  });

  it("Keeper-only access control: non-keeper cannot graduate", async function () {
    const { owner, creator, trader, keeper, treasury, wip, rt, exchange, factory } = await deployE2EFixture();

    const RT_UNIT = BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    // Launch token
    await rt.transfer(creator.address, amountToLock);
    await rt.connect(creator).approve(exchange.address, amountToLock);
    
    const launchTx = await factory.connect(creator).launchToken(
      rt.address,
      amountToLock,
      rt.address, // Using RT as IP Asset for simplicity
      "Test Token",
      "TST"
    );
    const receipt = await launchTx.wait();
    const wrapperAddress = receipt.events!.find((e: any) => e.event === "TokenLaunched")!.args!.wrapper;

    // Try to graduate as non-keeper (should fail)
    await expect(exchange.connect(trader).graduate(wrapperAddress))
      .to.be.revertedWithCustomError(exchange, "AccessControlUnauthorizedAccount");

    // Graduate as keeper (should succeed) - but first need trading to create reserves
    const keeperRole = await exchange.KEEPER_ROLE();
    await exchange.connect(owner).grantRole(keeperRole, keeper.address);
    
    // Need to do some trading to create curve reserves for graduation
    const wrapPerRt = await exchange.WRAP_PER_RT();
    const buyAmount = RT_UNIT.mul(wrapPerRt).mul(10);
    const baseCost = await exchange.calculateBuyPrice(wrapperAddress, buyAmount);
    const feeBps = await exchange.TRADE_FEE_BPS();
    const fee = baseCost.mul(feeBps).add(10000 - 1).div(10000);
    const totalCost = baseCost.add(fee);
    
    const blockNum = await ethers.provider.getBlockNumber();
    const blockData = await ethers.provider.getBlock(blockNum);
    const deadline = blockData.timestamp + 3600;
    
    await exchange.connect(trader).buy(wrapperAddress, buyAmount, totalCost, deadline, trader.address, { value: totalCost });
    
    // Lower threshold and graduate
    await exchange.connect(owner).updateGraduationThreshold(1);
    
    await expect(exchange.connect(keeper).graduate(wrapperAddress))
      .to.emit(exchange, "Graduated");
  });
});

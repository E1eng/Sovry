import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

// Chaos/Audit test suite: the goal is to find how the system can break or diverge from intended business logic.
// These tests intentionally include "spec mismatch" assertions to surface gaps between design docs and deployed code.

describe("Sovry Protocol - Chaos Audit", function () {
  async function deployFixture(opts?: {
    graduationThresholdWei?: string;
    revertMint?: boolean;
    treasuryOverride?: string;
    basePriceWei?: string;
    priceIncrementWei?: string;
  }) {
    const [owner, creator, trader, keeper, treasury] = await ethers.getSigners();

    const MockWIP = await ethers.getContractFactory("MockWIP");
    const wip = await MockWIP.deploy();

    const MockERC206 = await ethers.getContractFactory("MockERC20_6");
    const rt = await MockERC206.deploy("My Song Royalty", "RT-SONG");

    const MockPiperXV3Factory = await ethers.getContractFactory("MockPiperXV3Factory");
    const piperXV3Factory = await MockPiperXV3Factory.deploy();

    const MockPiperXV3PositionManager = await ethers.getContractFactory("MockPiperXV3PositionManager");
    const piperXV3PositionManager = await MockPiperXV3PositionManager.deploy(piperXV3Factory.address);

    const MockPiperXV3Router = await ethers.getContractFactory("MockPiperXV3Router");
    const piperXV3Router = await MockPiperXV3Router.deploy();

    if (opts?.revertMint !== undefined) {
      await piperXV3PositionManager.setRevertMint(opts.revertMint);
    }

    const MockRoyalty = await ethers.getContractFactory("MockRoyaltyWorkflows");
    const royaltyWorkflows = await MockRoyalty.deploy();

    const SovryExchange = await ethers.getContractFactory("SovryExchange");
    const graduationThreshold = ethers.utils.parseEther(opts?.graduationThresholdWei ?? "1000000");

    const treasuryAddr = opts?.treasuryOverride ?? treasury.address;

    const exchange = await SovryExchange.deploy(
      treasuryAddr,
      piperXV3Factory.address,
      piperXV3Router.address,
      piperXV3PositionManager.address,
      royaltyWorkflows.address,
      wip.address,
      graduationThreshold,
      owner.address
    );

    const basePrice = ethers.utils.parseEther(opts?.basePriceWei ?? "0.000000000000000001");
    const priceIncrement = ethers.utils.parseEther(opts?.priceIncrementWei ?? "0.000000000000000001");
    await exchange.connect(owner).setCurveParams(basePrice, priceIncrement);

    const SovryFactory = await ethers.getContractFactory("SovryFactory");
    const factory = await SovryFactory.deploy(exchange.address);

    const weth = wip.address;
    const SovryRouter = await ethers.getContractFactory("SovryRouter");
    const router = await SovryRouter.deploy(factory.address, exchange.address, weth);

    await exchange.connect(owner).setFactory(factory.address);
    await exchange.connect(owner).setRouter(router.address);

    const keeperRole = await exchange.KEEPER_ROLE();
    await exchange.connect(owner).grantRole(keeperRole, keeper.address);

    return {
      owner,
      creator,
      trader,
      keeper,
      treasury,
      wip,
      rt,
      piperXV3Factory,
      piperXV3PositionManager,
      piperXV3Router,
      royaltyWorkflows,
      exchange,
      factory,
      router,
    };
  }

  async function launchToken(params: {
    factory: any;
    exchange: any;
    rt: any;
    creator: any;
    amountToLock: any;
    ipAsset?: string;
  }) {
    await params.rt.transfer(params.creator.address, params.amountToLock);
    await params.rt.connect(params.creator).approve(params.exchange.address, params.amountToLock);

    const tx = await params.factory.connect(params.creator).launchToken(
      params.rt.address,
      params.amountToLock,
      params.ipAsset ?? params.rt.address,
      "Wrapper",
      "WRP"
    );

    const receipt = await tx.wait();
    const launchedEvent = receipt.events?.find((e: any) => e.event === "TokenLaunched");
    const wrapperAddress = launchedEvent?.args?.wrapper;
    expect(wrapperAddress).to.not.equal(undefined);
    return { wrapperAddress };
  }

  it("Spec mismatch: buy/sell has no quizAnswer anti-bot parameter; 5-minute sniper war not implemented", async function () {
    // WHY: the business spec mentions an anti-bot quiz hash for first 5 minutes.
    // This test proves the deployed interface has no such gate.
    const { exchange } = await deployFixture();

    const buyFn = exchange.interface.getFunction("buy");
    const sellFn = exchange.interface.getFunction("sell");

    expect(buyFn.inputs.map((i: any) => i.type)).to.deep.equal([
      "address",
      "uint256",
      "uint256",
      "uint256",
      "address",
    ]);

    expect(sellFn.inputs.map((i: any) => i.type)).to.deep.equal([
      "address",
      "uint256",
      "uint256",
      "uint256",
      "address",
    ]);
  });

  it("Spec mismatch: trade fee is not 1% and is not injected into reserve (reserve increases only by baseCost)", async function () {
    // WHY: business spec says 1% synthetic royalty reinjected to reserves.
    // The code currently increases reserveBalance only by baseCost and routes fee elsewhere.
    const { factory, exchange, rt, creator, trader } = await deployFixture();

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    const { wrapperAddress } = await launchToken({ factory, exchange, rt, creator, amountToLock });

    const wrapPerRt = await exchange.WRAP_PER_RT();
    const buyAmount = RT_UNIT.mul(wrapPerRt);

    const baseCost = await exchange.calculateBuyPrice(wrapperAddress, buyAmount);
    const fee = baseCost.mul(await exchange.TRADE_FEE_BPS()).add(10000 - 1).div(10000);
    const totalCost = baseCost.add(fee);

    const curveBefore = await exchange.bondingCurves(wrapperAddress);

    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;

    await exchange.connect(trader).buy(wrapperAddress, buyAmount, totalCost, deadline, trader.address, { value: totalCost });

    const curveAfter = await exchange.bondingCurves(wrapperAddress);

    expect(curveAfter.reserveBalance.sub(curveBefore.reserveBalance)).to.equal(baseCost);
  });

  it("Rounding stress: buy then immediate sell should never create a positive round-trip profit (fees + rounding)", async function () {
    // WHY: rounding bugs can create micro-arbitrage where buy->sell returns more than paid.
    // We avoid measuring wallet ETH (gas noise) and instead compare event values.
    const { factory, exchange, rt, creator, trader } = await deployFixture();

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    const { wrapperAddress } = await launchToken({ factory, exchange, rt, creator, amountToLock });

    const wrapPerRt = await exchange.WRAP_PER_RT();

    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;

    // Try multiple trade sizes to probe rounding boundaries.
    const tradeSizes = [
      RT_UNIT.mul(wrapPerRt),
      RT_UNIT.mul(wrapPerRt).mul(2),
      RT_UNIT.mul(wrapPerRt).mul(3),
    ];

    for (const buyAmount of tradeSizes) {
      const baseCost = await exchange.calculateBuyPrice(wrapperAddress, buyAmount);
      const feeBuy = baseCost.mul(await exchange.TRADE_FEE_BPS()).add(10000 - 1).div(10000);
      const totalCost = baseCost.add(feeBuy);

      const buyTx = await exchange
        .connect(trader)
        .buy(wrapperAddress, buyAmount, totalCost, deadline, trader.address, { value: totalCost });
      const buyReceipt = await buyTx.wait();

      const buyEvent = buyReceipt.events?.find((e: any) => e.event === "TokensPurchased");
      expect(buyEvent).to.not.equal(undefined);
      const buyCost = buyEvent.args.cost as any;
      const buyFee = buyEvent.args.feeAmount as any;

      // Approve and sell back the exact same amount.
      const wrapper = await ethers.getContractAt("SovryToken", wrapperAddress);
      await wrapper.connect(trader).approve(exchange.address, buyAmount);

      const sellTx = await exchange.connect(trader).sell(wrapperAddress, buyAmount, 0, deadline, trader.address);
      const sellReceipt = await sellTx.wait();

      const sellEvent = sellReceipt.events?.find((e: any) => e.event === "TokensSold");
      expect(sellEvent).to.not.equal(undefined);
      const sellProceeds = sellEvent.args.proceeds as any;
      const sellFee = sellEvent.args.feeAmount as any;

      const netReceived = sellProceeds.sub(sellFee);
      const totalPaid = buyCost.add(buyFee);

      // Strictly should be <= due to fees. If netReceived > totalPaid => profit bug.
      expect(netReceived.lte(totalPaid)).to.equal(true);
    }
  });

  it("Graduation safety: if V3 mint reverts, graduation reverts and token stays non-transferable", async function () {
    // WHY: Graduation must be atomic. If LP mint fails, state must not fall back to unlocked/free-trading mode.
    const { factory, exchange, rt, creator, trader } = await deployFixture({
      graduationThresholdWei: "0.000000000000000001",
      revertMint: true,
      basePriceWei: "0.000000000000000010",
      priceIncrementWei: "0.000000000000000001",
    });

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    // Use a price that makes marketCap at launch comfortably exceed the tiny threshold.
    const { wrapperAddress } = await launchToken({ factory, exchange, rt, creator, amountToLock });

    const marketCap = await exchange.getMarketCap(wrapperAddress);
    expect(marketCap.gt(0)).to.equal(true);

    const wrapPerRt = await exchange.WRAP_PER_RT();
    const buyAmount = RT_UNIT.mul(wrapPerRt);

    const baseCost = await exchange.calculateBuyPrice(wrapperAddress, buyAmount);
    const fee = baseCost.mul(await exchange.TRADE_FEE_BPS()).add(10000 - 1).div(10000);
    const totalCost = baseCost.add(fee);

    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;

    await exchange.connect(trader).buy(wrapperAddress, buyAmount, totalCost, deadline, trader.address, { value: totalCost });

    const wrapper = await ethers.getContractAt("SovryToken", wrapperAddress);

    await expect(exchange.graduate(wrapperAddress)).to.be.reverted;

    const tokenAfter = await exchange.launchedTokens(wrapperAddress);
    expect(tokenAfter.graduated).to.equal(false);
    expect(await exchange.bondingCurveActive(wrapperAddress)).to.equal(true);
    expect(await exchange.dexPools(wrapperAddress)).to.equal(ethers.constants.AddressZero);

    expect(await wrapper.owner()).to.equal(exchange.address);
    expect(await wrapper.transfersLocked()).to.equal(true);
  });

  it("MEV surface: post-graduation buyback uses harvested WIP and routes via keeper", async function () {
    const { factory, exchange, wip, rt, creator, keeper, trader, owner, royaltyWorkflows } = await deployFixture();

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    const { wrapperAddress } = await launchToken({ factory, exchange, rt, creator, amountToLock });

    // We lower the threshold as admin, then explicitly call `graduate()`.
    // Graduation is keeper-triggered and should not be auto-executed by buys.
    await exchange.connect(owner).updateGraduationThreshold(1);

    // Seed the curve reserve with a small buy so graduation has ETH liquidity to migrate.
    const wrapPerRt = await exchange.WRAP_PER_RT();
    const buyAmount = RT_UNIT.mul(wrapPerRt);
    const baseCost = await exchange.calculateBuyPrice(wrapperAddress, buyAmount);
    const fee = baseCost.mul(await exchange.TRADE_FEE_BPS()).add(10000 - 1).div(10000);
    const totalCost = baseCost.add(fee);
    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;
    await exchange.connect(trader).buy(wrapperAddress, buyAmount, totalCost, deadline, trader.address, { value: totalCost });

    await exchange.graduate(wrapperAddress);

    // Fund WIP and deposit royalties after graduation.
    // Fund mock vault with WIP so harvestFromVault can pull it
    await wip.connect(creator).deposit({ value: ethers.utils.parseEther("1") });
    await wip.connect(creator).transfer(royaltyWorkflows.address, ethers.utils.parseEther("1") );
    await royaltyWorkflows.connect(owner).setWipToken(wip.address);

    const balBefore = await wip.balanceOf(exchange.address);

    await expect(exchange.connect(keeper).harvestFromVault(wrapperAddress)).to.not.be.reverted;

    const balAfter = await wip.balanceOf(exchange.address);
    expect(balAfter).to.be.gt(balBefore);
  });

  it("pushFeesToVault: keeper wraps queued native fees into WIP via royalty module", async function () {
    const { factory, exchange, rt, creator, trader, keeper, royaltyWorkflows, wip } = await deployFixture();

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    const { wrapperAddress } = await launchToken({ factory, exchange, rt, creator, amountToLock });

    const wrapPerRt = await exchange.WRAP_PER_RT();
    const buyAmount = RT_UNIT.mul(wrapPerRt);
    const baseCost = await exchange.calculateBuyPrice(wrapperAddress, buyAmount);
    const fee = baseCost.mul(await exchange.TRADE_FEE_BPS()).add(10000 - 1).div(10000);
    const treasuryShare = fee.div(2);
    const ipaShare = fee.sub(treasuryShare);
    const totalCost = baseCost.add(fee);
    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;

    await exchange
      .connect(trader)
      .buy(wrapperAddress, buyAmount, totalCost, deadline, trader.address, { value: totalCost });

    expect(await exchange.accumulatedRoyaltyNative(wrapperAddress)).to.equal(ipaShare);

    const ipAsset = (await exchange.launchedTokens(wrapperAddress)).ipAsset;
    const wipBefore = await wip.balanceOf(ipAsset);

    await expect(exchange.connect(keeper).pushFeesToVault(wrapperAddress))
      .to.emit(exchange, "RoyaltyRevenueProcessed")
      .withArgs(wrapperAddress, ipaShare, ipAsset);

    expect(await exchange.accumulatedRoyaltyNative(wrapperAddress)).to.equal(0);

    const wipAfter = await wip.balanceOf(ipAsset);
    expect(wipAfter.sub(wipBefore)).to.equal(ipaShare);

    expect(await royaltyWorkflows.lastChildIpId()).to.equal(ipAsset);
    expect(await royaltyWorkflows.lastPayer()).to.equal(exchange.address);
    expect(await royaltyWorkflows.lastCurrencyToken()).to.equal(wip.address);
    expect(await royaltyWorkflows.lastAmount()).to.equal(ipaShare);
    expect(await royaltyWorkflows.totalRoyaltyPaid()).to.equal(ipaShare);
  });

  it("Redeem: burns wrapper and releases pro-rata RT", async function () {
    const { factory, exchange, rt, creator, trader } = await deployFixture();

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    const { wrapperAddress } = await launchToken({ factory, exchange, rt, creator, amountToLock });

    const wrapPerRt = await exchange.WRAP_PER_RT();
    const buyAmount = RT_UNIT.mul(wrapPerRt);

    const baseCost = await exchange.calculateBuyPrice(wrapperAddress, buyAmount);
    const fee = baseCost.mul(await exchange.TRADE_FEE_BPS()).add(10000 - 1).div(10000);
    const totalCost = baseCost.add(fee);

    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;
    await exchange.connect(trader).buy(wrapperAddress, buyAmount, totalCost, deadline, trader.address, { value: totalCost });

    const wrapper = await ethers.getContractAt("SovryToken", wrapperAddress);

    const tokenBefore = await exchange.launchedTokens(wrapperAddress);
    const supplyBefore = await wrapper.totalSupply();
    const traderRtBefore = await rt.balanceOf(trader.address);

    const redeemAmount = ethers.utils.parseUnits("1000", 18);
    const expectedRt = redeemAmount.mul(tokenBefore.totalLocked).div(supplyBefore);

    await wrapper.connect(trader).approve(exchange.address, redeemAmount);

    await expect(exchange.connect(trader).redeem(wrapperAddress, redeemAmount, trader.address))
      .to.emit(exchange, "TokensRedeemed")
      .withArgs(trader.address, wrapperAddress, redeemAmount, expectedRt, trader.address);

    const tokenAfter = await exchange.launchedTokens(wrapperAddress);
    const supplyAfter = await wrapper.totalSupply();
    const traderRtAfter = await rt.balanceOf(trader.address);

    expect(supplyAfter).to.equal(supplyBefore.sub(redeemAmount));
    expect(tokenAfter.totalLocked).to.equal(tokenBefore.totalLocked.sub(expectedRt));
    expect(traderRtAfter.sub(traderRtBefore)).to.equal(expectedRt);
  });

  it("Redeem: tiny wrapperAmount that rounds to 0 RT reverts", async function () {
    const { factory, exchange, rt, creator } = await deployFixture();

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    const { wrapperAddress } = await launchToken({ factory, exchange, rt, creator, amountToLock });

    await expect(exchange.redeem(wrapperAddress, 1, creator.address)).to.be.revertedWithCustomError(exchange, "InvalidAmount");
  });

  it("Graduation safety: pre-existing pool blocks graduation so migration price cannot be front-run", async function () {
    const { factory, exchange, rt, creator, trader, piperXV3PositionManager, wip } = await deployFixture({
      graduationThresholdWei: "0.000000000000000001",
      basePriceWei: "0.000000000000000010",
      priceIncrementWei: "0.000000000000000001",
    });

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    const { wrapperAddress } = await launchToken({ factory, exchange, rt, creator, amountToLock });

    const wrapPerRt = await exchange.WRAP_PER_RT();
    const buyAmount = RT_UNIT.mul(wrapPerRt);
    const baseCost = await exchange.calculateBuyPrice(wrapperAddress, buyAmount);
    const fee = baseCost.mul(await exchange.TRADE_FEE_BPS()).add(10000 - 1).div(10000);
    const totalCost = baseCost.add(fee);
    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;
    await exchange.connect(trader).buy(wrapperAddress, buyAmount, totalCost, deadline, trader.address, { value: totalCost });

    const [token0, token1] =
      wrapperAddress.toLowerCase() < wip.address.toLowerCase()
        ? [wrapperAddress, wip.address]
        : [wip.address, wrapperAddress];

    const q96 = ethers.BigNumber.from(2).pow(96);
    await piperXV3PositionManager
      .connect(trader)
      .createAndInitializePoolIfNecessary(token0, token1, 10_000, q96);

    await expect(exchange.graduate(wrapperAddress)).to.be.revertedWithCustomError(exchange, "DexLiquidityFailed");

    const tokenAfter = await exchange.launchedTokens(wrapperAddress);
    expect(tokenAfter.graduated).to.equal(false);
    expect(await exchange.bondingCurveActive(wrapperAddress)).to.equal(true);

    const wrapper = await ethers.getContractAt("SovryToken", wrapperAddress);
    expect(await wrapper.owner()).to.equal(exchange.address);
    expect(await wrapper.transfersLocked()).to.equal(true);
  });

  it("Devil advocate: redeem() remains enabled after graduation (potential RT drain)", async function () {
    const { factory, exchange, rt, creator, trader, owner } = await deployFixture();

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    const { wrapperAddress } = await launchToken({ factory, exchange, rt, creator, amountToLock });

    // Force graduation quickly.
    await exchange.connect(owner).updateGraduationThreshold(1);

    // Seed curve reserve then graduate.
    const wrapPerRt = await exchange.WRAP_PER_RT();
    const buyAmount = RT_UNIT.mul(wrapPerRt);
    const baseCost = await exchange.calculateBuyPrice(wrapperAddress, buyAmount);
    const fee = baseCost.mul(await exchange.TRADE_FEE_BPS()).add(10000 - 1).div(10000);
    const totalCost = baseCost.add(fee);
    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;
    await exchange.connect(trader).buy(wrapperAddress, buyAmount, totalCost, deadline, trader.address, { value: totalCost });

    await expect(exchange.graduate(wrapperAddress)).to.emit(exchange, "Graduated");

    const wrapper = await ethers.getContractAt("SovryToken", wrapperAddress);
    const supplyBefore = await wrapper.totalSupply();
    const tokenBefore = await exchange.launchedTokens(wrapperAddress);

    // Redeem after graduation still works today.
    const redeemAmount = ethers.utils.parseUnits("1", 18);
    await wrapper.connect(trader).approve(exchange.address, redeemAmount);
    await expect(exchange.connect(trader).redeem(wrapperAddress, redeemAmount, trader.address)).to.emit(exchange, "TokensRedeemed");

    const supplyAfter = await wrapper.totalSupply();
    const tokenAfter = await exchange.launchedTokens(wrapperAddress);
    expect(supplyAfter).to.equal(supplyBefore.sub(redeemAmount));
    expect(tokenAfter.totalLocked.lt(tokenBefore.totalLocked)).to.equal(true);
  });

});

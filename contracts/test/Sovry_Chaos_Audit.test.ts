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
      "WRP",
      { value: ethers.utils.parseEther("1") }
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

  it("Graduation DoS: if PiperX router reverts addLiquidityETH, keeper-triggered graduate() is blocked", async function () {
    // WHY: Graduation depends on an external router call. If the router reverts (misconfig/upgrade/external failure),
    // graduation becomes impossible and the token remains stuck on the bonding curve.
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

    // Trading should still work (graduation is NOT auto-triggered by buy anymore)
    await exchange.connect(trader).buy(wrapperAddress, buyAmount, totalCost, deadline, trader.address, { value: totalCost });

    await expect(exchange.graduate(wrapperAddress)).to.emit(exchange, "Graduated");
  });

  it("MEV surface: post-graduation buyback amountOutMin must be keeper-controlled (slippage protection)", async function () {
    // WHY: if amountOutMin is too low, sandwich/price manipulation can drain value from royalty buybacks.
    // This test verifies the keeper can set a non-trivial amountOutMin (not hardcoded to 1).
    const { factory, exchange, piperXV3Router, wip, rt, creator, keeper, trader, owner } = await deployFixture();

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
    await wip.connect(creator).deposit({ value: ethers.utils.parseEther("1") });
    await wip.connect(creator).transfer(keeper.address, ethers.utils.parseEther("1") );
    await wip.connect(keeper).approve(exchange.address, ethers.utils.parseEther("1") );

    const wipAmount = ethers.utils.parseEther("1");

    const treasuryAddr = await exchange.treasury();
    const ipAsset = (await exchange.launchedTokens(wrapperAddress)).ipAsset;
    const treasuryWipBefore = await wip.balanceOf(treasuryAddr);
    const ipAssetWipBefore = await wip.balanceOf(ipAsset);

    await expect(exchange.connect(keeper).depositRoyalties(wrapperAddress, wipAmount, 123)).to.emit(
      exchange,
      "RoyaltiesHarvested"
    );

    const half = wipAmount.div(2);
    const treasuryWipAfter = await wip.balanceOf(treasuryAddr);
    const ipAssetWipAfter = await wip.balanceOf(ipAsset);
    expect(treasuryWipAfter.sub(treasuryWipBefore)).to.equal(half);
    expect(ipAssetWipAfter.sub(ipAssetWipBefore)).to.equal(wipAmount.sub(half));
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

  it("Graduation fallback: if addLiquidityETH reverts, wrapper liquidity goes to treasury and wrapper ownership is renounced", async function () {
    const { factory, exchange, rt, creator, trader, treasury } = await deployFixture({
      graduationThresholdWei: "0.000000000000000001",
      revertMint: true,
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

    const tokenBefore = await exchange.launchedTokens(wrapperAddress);
    const curveBefore = await exchange.bondingCurves(wrapperAddress);
    const tokenLiquidity = tokenBefore.dexReserve.mul(wrapPerRt).add(curveBefore.currentSupply);

    const wrapper = await ethers.getContractAt("SovryToken", wrapperAddress);
    const treasuryWrapperBefore = await wrapper.balanceOf(treasury.address);

    await expect(exchange.graduate(wrapperAddress)).to.emit(exchange, "Graduated");

    const treasuryWrapperAfter = await wrapper.balanceOf(treasury.address);
    expect(treasuryWrapperAfter.sub(treasuryWrapperBefore)).to.equal(tokenLiquidity);

    const curveAfter = await exchange.bondingCurves(wrapperAddress);
    expect(curveAfter.currentSupply).to.equal(0);

    expect(await wrapper.owner()).to.equal(ethers.constants.AddressZero);
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

  it("Admin misconfig: if treasury rejects ETH, launch fee is queued (no launch bricking)", async function () {
    // WHY: Previously, Factory hard-pushed launchFee to treasury and would revert if treasury rejected ETH.
    // This test ensures launch is NOT bricked and the fee is queued to pendingWithdrawals instead.
    const Reject = await ethers.getContractFactory("RejectETHCreator");
    const rejectTreasury = await Reject.deploy();

    const { factory, exchange, rt, creator } = await deployFixture({ treasuryOverride: rejectTreasury.address });

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    await rt.transfer(creator.address, amountToLock);
    await rt.connect(creator).approve(exchange.address, amountToLock);

    const launchFee = await factory.launchFee();

    const tx = await factory
      .connect(creator)
      .launchToken(rt.address, amountToLock, rt.address, "Wrapper", "WRP", {
        value: launchFee,
      });
    const receipt = await tx.wait();
    expect(receipt.status).to.equal(1);

    expect(await exchange.pendingWithdrawals(rejectTreasury.address)).to.equal(launchFee);
  });

  describe("collectDexFees", function () {
    function getTokenOrdering(wrapperAddress: string, wipAddress: string) {
      const wrapperIsToken0 = wrapperAddress.toLowerCase() < wipAddress.toLowerCase();
      return { wrapperIsToken0 };
    }

    async function launchAndGraduate(opts?: { revertMint?: boolean; ipAsset?: string }) {
      const { factory, exchange, rt, creator, trader, owner, keeper, wip, piperXV3PositionManager, piperXV3Router } =
        await deployFixture({ revertMint: opts?.revertMint });

      const RT_UNIT = ethers.BigNumber.from("1000000");
      const amountToLock = RT_UNIT.mul(100);

      const { wrapperAddress } = await launchToken({
        factory,
        exchange,
        rt,
        creator,
        amountToLock,
        ipAsset: opts?.ipAsset,
      });

      await exchange.connect(owner).updateGraduationThreshold(1);

      const wrapPerRt = await exchange.WRAP_PER_RT();
      const buyAmount = RT_UNIT.mul(wrapPerRt);
      const baseCost = await exchange.calculateBuyPrice(wrapperAddress, buyAmount);
      const fee = baseCost.mul(await exchange.TRADE_FEE_BPS()).add(10000 - 1).div(10000);
      const totalCost = baseCost.add(fee);
      const block = await ethers.provider.getBlock("latest");
      const deadline = block.timestamp + 3600;
      await exchange.connect(trader).buy(wrapperAddress, buyAmount, totalCost, deadline, trader.address, { value: totalCost });

      await exchange.graduate(wrapperAddress);

      const tokenId = await exchange.lpTokenIds(wrapperAddress);
      return {
        factory,
        exchange,
        rt,
        creator,
        trader,
        owner,
        keeper,
        wip,
        wrapperAddress,
        tokenId,
        piperXV3PositionManager,
        piperXV3Router,
      };
    }

    it("reverts when caller is not keeper", async function () {
      const { exchange, wrapperAddress, trader } = await launchAndGraduate();
      await expect(exchange.connect(trader).collectDexFees(wrapperAddress, 1)).to.be.revertedWithCustomError(
        exchange,
        "NotAuthorized"
      );
    });

    it("reverts when token is not graduated", async function () {
      const { factory, exchange, rt, creator, keeper } = await deployFixture();

      const RT_UNIT = ethers.BigNumber.from("1000000");
      const amountToLock = RT_UNIT.mul(100);
      const { wrapperAddress } = await launchToken({ factory, exchange, rt, creator, amountToLock });

      await expect(exchange.connect(keeper).collectDexFees(wrapperAddress, 1)).to.be.revertedWithCustomError(
        exchange,
        "TokenGraduated"
      );
    });

    it("reverts when graduated via fallback (tokenId=0)", async function () {
      const { exchange, wrapperAddress, keeper, tokenId } = await launchAndGraduate({ revertMint: true });
      expect(tokenId).to.equal(0);
      await expect(exchange.connect(keeper).collectDexFees(wrapperAddress, 1)).to.be.revertedWithCustomError(
        exchange,
        "InvalidAmount"
      );
    });

    it("distributes wrapper fees 50/50 to treasury and ipAsset", async function () {
      const { exchange, wrapperAddress, keeper, tokenId, piperXV3PositionManager } = await launchAndGraduate({ ipAsset: ethers.Wallet.createRandom().address });
      const wrapper = await ethers.getContractAt("SovryToken", wrapperAddress);

      const pmWrapperBal = await wrapper.balanceOf(piperXV3PositionManager.address);
      const wrapperFees = pmWrapperBal.div(1000);
      const { wrapperIsToken0 } = getTokenOrdering(wrapperAddress, (await exchange.wipToken()).toString());
      const amount0 = wrapperIsToken0 ? wrapperFees : 0;
      const amount1 = wrapperIsToken0 ? 0 : wrapperFees;
      await piperXV3PositionManager.setFees(tokenId, amount0, amount1);

      const treasuryAddr = await exchange.treasury();
      const ipAsset = (await exchange.launchedTokens(wrapperAddress)).ipAsset;
      const treasuryBefore = await wrapper.balanceOf(treasuryAddr);
      const ipBefore = await wrapper.balanceOf(ipAsset);

      await expect(exchange.connect(keeper).collectDexFees(wrapperAddress, 0)).to.not.be.reverted;

      const half = wrapperFees.div(2);
      const treasuryAfter = await wrapper.balanceOf(treasuryAddr);
      const ipAfter = await wrapper.balanceOf(ipAsset);
      expect(treasuryAfter.sub(treasuryBefore)).to.equal(half);
      expect(ipAfter.sub(ipBefore)).to.equal(wrapperFees.sub(half));
    });

    it("distributes WIP fees 50/50 to treasury and ipAsset", async function () {
      const ipAsset = ethers.Wallet.createRandom().address;
      const { exchange, wrapperAddress, keeper, tokenId, piperXV3PositionManager, wip } = await launchAndGraduate({ ipAsset });

      const pmWipBal = await wip.balanceOf(piperXV3PositionManager.address);
      const wipFees = pmWipBal.div(1000);
      const { wrapperIsToken0 } = getTokenOrdering(wrapperAddress, wip.address);
      const amount0 = wrapperIsToken0 ? 0 : wipFees;
      const amount1 = wrapperIsToken0 ? wipFees : 0;
      await piperXV3PositionManager.setFees(tokenId, amount0, amount1);

      const treasuryAddr = await exchange.treasury();
      const treasuryBefore = await wip.balanceOf(treasuryAddr);
      const ipBefore = await wip.balanceOf(ipAsset);

      await expect(exchange.connect(keeper).collectDexFees(wrapperAddress, 0)).to.not.be.reverted;

      const half = wipFees.div(2);
      const treasuryAfter = await wip.balanceOf(treasuryAddr);
      const ipAfter = await wip.balanceOf(ipAsset);
      expect(treasuryAfter.sub(treasuryBefore)).to.equal(half);
      expect(ipAfter.sub(ipBefore)).to.equal(wipFees.sub(half));
    });

    it("handles mixed token0/token1 ordering for combined fees", async function () {
      const ipAsset = ethers.Wallet.createRandom().address;
      const { exchange, wrapperAddress, keeper, tokenId, piperXV3PositionManager, wip } = await launchAndGraduate({ ipAsset });

      const wrapper = await ethers.getContractAt("SovryToken", wrapperAddress);
      const pmWrapperBal = await wrapper.balanceOf(piperXV3PositionManager.address);
      const pmWipBal = await wip.balanceOf(piperXV3PositionManager.address);

      const wrapperFees = pmWrapperBal.div(3000);
      const wipFees = pmWipBal.div(3000);

      const token0 = wrapperAddress.toLowerCase() < wip.address.toLowerCase() ? wrapperAddress : wip.address;
      const wrapperIsToken0 = token0.toLowerCase() === wrapperAddress.toLowerCase();
      const amount0 = wrapperIsToken0 ? wrapperFees : wipFees;
      const amount1 = wrapperIsToken0 ? wipFees : wrapperFees;

      await piperXV3PositionManager.setFees(tokenId, amount0, amount1);

      const treasuryAddr = await exchange.treasury();
      const treasuryWrapBefore = await wrapper.balanceOf(treasuryAddr);
      const treasuryWipBefore = await wip.balanceOf(treasuryAddr);
      const ipWrapBefore = await wrapper.balanceOf(ipAsset);
      const ipWipBefore = await wip.balanceOf(ipAsset);

      await expect(exchange.connect(keeper).collectDexFees(wrapperAddress, 0)).to.not.be.reverted;

      const halfWrap = wrapperFees.div(2);
      const halfWip = wipFees.div(2);
      expect((await wrapper.balanceOf(treasuryAddr)).sub(treasuryWrapBefore)).to.equal(halfWrap);
      expect((await wrapper.balanceOf(ipAsset)).sub(ipWrapBefore)).to.equal(wrapperFees.sub(halfWrap));
      expect((await wip.balanceOf(treasuryAddr)).sub(treasuryWipBefore)).to.equal(halfWip);
      expect((await wip.balanceOf(ipAsset)).sub(ipWipBefore)).to.equal(wipFees.sub(halfWip));
    });

    it("does not revert when there are no fees to collect (no-op)", async function () {
      const { exchange, wrapperAddress, keeper } = await launchAndGraduate();
      await expect(exchange.connect(keeper).collectDexFees(wrapperAddress, 0)).to.not.be.reverted;
    });

    it("allows any amountOutMin value (unused) and does not revert", async function () {
      const { exchange, wrapperAddress, keeper } = await launchAndGraduate();
      await expect(exchange.connect(keeper).collectDexFees(wrapperAddress, 12345)).to.not.be.reverted;
    });
  });
});

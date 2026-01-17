import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

// Chaos/Audit test suite: the goal is to find how the system can break or diverge from intended business logic.
// These tests intentionally include "spec mismatch" assertions to surface gaps between design docs and deployed code.

describe("Sovry Protocol - Chaos Audit", function () {
  async function deployFixture(opts?: { graduationThresholdWei?: string; revertAddLiquidity?: boolean; treasuryOverride?: string }) {
    const [owner, creator, trader, keeper, treasury] = await ethers.getSigners();

    const MockWIP = await ethers.getContractFactory("MockWIP");
    const wip = await MockWIP.deploy();

    const MockERC206 = await ethers.getContractFactory("MockERC20_6");
    const rt = await MockERC206.deploy("My Song Royalty", "RT-SONG");

    const MockPiperX = await ethers.getContractFactory("MockPiperXRouter");
    const piperXRouter = await MockPiperX.deploy();

    if (opts?.revertAddLiquidity !== undefined) {
      await piperXRouter.setRevertAddLiquidity(opts.revertAddLiquidity);
    }

    const MockRoyalty = await ethers.getContractFactory("MockRoyaltyWorkflows");
    const royaltyWorkflows = await MockRoyalty.deploy();

    const SovryExchange = await ethers.getContractFactory("SovryExchange");
    const graduationThreshold = ethers.utils.parseEther(opts?.graduationThresholdWei ?? "1000000");

    const treasuryAddr = opts?.treasuryOverride ?? treasury.address;

    const exchange = await SovryExchange.deploy(
      treasuryAddr,
      piperXRouter.address,
      royaltyWorkflows.address,
      wip.address,
      graduationThreshold,
      owner.address
    );

    const SovryFactory = await ethers.getContractFactory("SovryFactory");
    const factory = await SovryFactory.deploy(exchange.address);

    const weth = await piperXRouter.WETH();
    const SovryRouter = await ethers.getContractFactory("SovryRouter");
    const router = await SovryRouter.deploy(factory.address, exchange.address, weth);

    await exchange.connect(owner).setFactory(factory.address);
    await exchange.connect(owner).setRouter(router.address);

    const keeperRole = await exchange.KEEPER_ROLE();
    await exchange.connect(owner).grantRole(keeperRole, keeper.address);

    return { owner, creator, trader, keeper, treasury, wip, rt, piperXRouter, royaltyWorkflows, exchange, factory, router };
  }

  async function launchToken(params: {
    factory: any;
    exchange: any;
    rt: any;
    creator: any;
    amountToLock: any;
    basePriceWei?: string;
    priceIncrementWei?: string;
  }) {
    const basePrice = ethers.utils.parseEther(params.basePriceWei ?? "0.000000000000000001");
    const priceIncrement = ethers.utils.parseEther(params.priceIncrementWei ?? "0.000000000000000001");

    await params.rt.transfer(params.creator.address, params.amountToLock);
    await params.rt.connect(params.creator).approve(params.exchange.address, params.amountToLock);

    const tx = await params.factory.connect(params.creator).launchToken(
      params.rt.address,
      params.amountToLock,
      "Wrapper",
      "WRP",
      basePrice,
      priceIncrement,
      { value: ethers.utils.parseEther("1") }
    );

    const receipt = await tx.wait();
    const launchedEvent = receipt.events?.find((e: any) => e.event === "TokenLaunched");
    const wrapperAddress = launchedEvent?.args?.wrapper;
    expect(wrapperAddress).to.not.equal(undefined);
    return { wrapperAddress, basePrice, priceIncrement };
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

    // If fee were injected, reserve would increase by baseCost + fee.
    // Current behavior: reserve increases by baseCost only.
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
    const { factory, exchange, rt, creator, trader } = await deployFixture({ graduationThresholdWei: "0.000000000000000001", revertAddLiquidity: true });

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    // Use a price that makes marketCap at launch comfortably exceed the tiny threshold.
    const { wrapperAddress } = await launchToken({
      factory,
      exchange,
      rt,
      creator,
      amountToLock,
      basePriceWei: "0.000000000000000010",
      priceIncrementWei: "0.000000000000000001",
    });

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

    // But explicit graduation is blocked.
    await expect(exchange.graduate(wrapperAddress)).to.be.revertedWithCustomError(exchange, "DexLiquidityFailed");
  });

  it("MEV surface: post-graduation buyback uses amountOutMin=1 (no slippage protection)", async function () {
    // WHY: amountOutMin=1 allows sandwich/price manipulation against royalty buybacks.
    // An attacker can make the swap execute at a terrible rate, extracting the royalty value.
    const { factory, exchange, piperXRouter, wip, rt, creator, keeper, trader, owner } = await deployFixture();

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

    // Fund WIP and deposit royalties after graduation to force _buybackAndBurn.
    await wip.connect(creator).deposit({ value: ethers.utils.parseEther("1") });
    await wip.connect(creator).transfer(keeper.address, ethers.utils.parseEther("1") );
    await wip.connect(keeper).approve(exchange.address, ethers.utils.parseEther("1") );

    // MockPiperXRouter emits:
    // SwapExactETHForTokensCalled(uint256 amountOutMin, address[] path, address to, uint256 amountIn)
    await expect(exchange.connect(keeper).depositRoyalties(wrapperAddress, ethers.utils.parseEther("1")))
      .to.emit(piperXRouter, "SwapExactETHForTokensCalled")
      .withArgs(
        1,
        anyValue,
        "0x000000000000000000000000000000000000dEaD",
        ethers.utils.parseEther("1")
      );
  });

  it("Admin misconfig DoS: if treasury cannot receive ETH, Factory.launchToken is blocked", async function () {
    // WHY: SovryFactory hard-pushes ETH to treasury and reverts on failure.
    // If treasury is accidentally set to a contract that rejects ETH, launches are permanently blocked.
    const Reject = await ethers.getContractFactory("RejectETHCreator");
    const rejectTreasury = await Reject.deploy();

    const { factory, exchange, rt, creator } = await deployFixture({ treasuryOverride: rejectTreasury.address });

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    await rt.transfer(creator.address, amountToLock);
    await rt.connect(creator).approve(exchange.address, amountToLock);

    const basePrice = ethers.utils.parseEther("0.000000000000000001");
    const priceIncrement = ethers.utils.parseEther("0.000000000000000001");

    await expect(
      factory.connect(creator).launchToken(rt.address, amountToLock, "Wrapper", "WRP", basePrice, priceIncrement, {
        value: ethers.utils.parseEther("1"),
      })
    ).to.be.revertedWithCustomError(factory, "TransferFailed");
  });
});

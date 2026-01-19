import { expect } from "chai";
import { ethers } from "hardhat";

describe("SovryProtocol (Factory/Exchange/Router) Integration", function () {
  async function deployProtocolFixture() {
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

    const MockRoyalty = await ethers.getContractFactory("MockRoyaltyWorkflows");
    const royaltyWorkflows = await MockRoyalty.deploy();

    const SovryExchange = await ethers.getContractFactory("SovryExchange");
    const graduationThreshold = ethers.utils.parseEther("1000000");
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

    const basePrice = ethers.utils.parseEther("0.000000000000000001");
    const priceIncrement = ethers.utils.parseEther("0.000000000000000001");
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

  it("Launch: Factory.launchToken emits TokenLaunched", async function () {
    const { factory, exchange, rt, creator } = await deployProtocolFixture();

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    await rt.transfer(creator.address, amountToLock);
    await rt.connect(creator).approve(exchange.address, amountToLock);

    await expect(
      factory.connect(creator).launchToken(
        rt.address,
        amountToLock,
        rt.address,
        "Wrapper",
        "WRP",
        { value: ethers.utils.parseEther("1") }
      )
    ).to.emit(factory, "TokenLaunched");
  });

  it("Trade: Router.buyETH increases Exchange reserve", async function () {
    const { factory, exchange, router, rt, creator, trader } = await deployProtocolFixture();

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    await rt.transfer(creator.address, amountToLock);
    await rt.connect(creator).approve(exchange.address, amountToLock);

    const launchTx = await factory.connect(creator).launchToken(
      rt.address,
      amountToLock,
      creator.address,
      "Wrapper",
      "WRP",
      { value: ethers.utils.parseEther("1") }
    );
    const receipt = await launchTx.wait();

    const launchedEvent = receipt.events?.find((e) => e.event === "TokenLaunched");
    expect(launchedEvent?.args?.wrapper).to.not.equal(undefined);

    const wrapperAddress = launchedEvent!.args!.wrapper;

    const wrapPerRt = await exchange.WRAP_PER_RT();
    const buyAmount = RT_UNIT.mul(wrapPerRt);

    const baseCost = await exchange.calculateBuyPrice(wrapperAddress, buyAmount);
    const feeBps = await exchange.TRADE_FEE_BPS();
    const fee = baseCost.mul(feeBps).add(10000 - 1).div(10000);
    const totalCost = baseCost.add(fee);

    const blockNum = await ethers.provider.getBlockNumber();
    const blockData = await ethers.provider.getBlock(blockNum);
    const deadline = blockData.timestamp + 3600;

    const curveBefore = await exchange.bondingCurves(wrapperAddress);
    const reserveBefore = curveBefore.reserveBalance;

    await expect(
      router.connect(trader).buyETH(wrapperAddress, buyAmount, totalCost, deadline, { value: totalCost })
    ).to.emit(exchange, "TokensPurchased");

    const curveAfter = await exchange.bondingCurves(wrapperAddress);
    const reserveAfter = curveAfter.reserveBalance;

    expect(reserveAfter.sub(reserveBefore)).to.equal(baseCost);
  });

  it("Royalty Bot: keeper can call Exchange.depositRoyalties, random user cannot", async function () {
    const { factory, exchange, wip, rt, creator, keeper, trader } = await deployProtocolFixture();

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);

    await rt.transfer(creator.address, amountToLock);
    await rt.connect(creator).approve(exchange.address, amountToLock);

    const launchTx = await factory.connect(creator).launchToken(
      rt.address,
      amountToLock,
      rt.address,
      "Wrapper",
      "WRP",
      { value: ethers.utils.parseEther("1") }
    );
    const receipt = await launchTx.wait();
    const wrapperAddress = receipt.events!.find((e) => e.event === "TokenLaunched")!.args!.wrapper;

    // Fund WIP contract with ETH and move WIP to keeper for explicit deposit
    await wip.connect(creator).deposit({ value: ethers.utils.parseEther("1") });
    await wip.connect(creator).transfer(keeper.address, ethers.utils.parseEther("1"));
    await wip.connect(keeper).approve(exchange.address, ethers.utils.parseEther("1"));

    const treasuryWipBefore = await wip.balanceOf((await exchange.treasury()).toString());
    const ipAsset = (await exchange.launchedTokens(wrapperAddress)).ipAsset;
    const ipAssetWipBefore = await wip.balanceOf(ipAsset);

    await expect(exchange.connect(keeper).depositRoyalties(wrapperAddress, ethers.utils.parseEther("1"), 1)).to.emit(
      exchange,
      "RoyaltiesHarvested"
    );

    const treasuryWipAfter = await wip.balanceOf((await exchange.treasury()).toString());
    const ipAssetWipAfter = await wip.balanceOf(ipAsset);

    const half = ethers.utils.parseEther("1").div(2);
    expect(treasuryWipAfter.sub(treasuryWipBefore)).to.equal(half);
    expect(ipAssetWipAfter.sub(ipAssetWipBefore)).to.equal(ethers.utils.parseEther("1").sub(half));

    await expect(exchange.connect(trader).depositRoyalties(wrapperAddress, ethers.utils.parseEther("1"), 1)).to.be
      .revertedWithCustomError(
      exchange,
      "NotAuthorized"
    );
  });

  it("DoS regression: creator that rejects ETH cannot break trading; fees become withdrawable", async function () {
    const { owner, trader, exchange, factory, rt } = await deployProtocolFixture();

    const Reject = await ethers.getContractFactory("RejectETHCreator");
    const rejectCreator = await Reject.deploy();
    const rejectTreasury = await Reject.deploy();

    await exchange.connect(owner).setTreasury(rejectTreasury.address);

    const RT_UNIT = ethers.BigNumber.from("1000000");
    const amountToLock = RT_UNIT.mul(100);
    await rt.mint(rejectCreator.address, amountToLock);

    const wrapperAddress = await rejectCreator.callStatic.launch(
      factory.address,
      exchange.address,
      rt.address,
      amountToLock,
      rt.address,
      "Wrapper",
      "WRP",
      { value: ethers.utils.parseEther("1") }
    );

    await rejectCreator.launch(
      factory.address,
      exchange.address,
      rt.address,
      amountToLock,
      rt.address,
      "Wrapper",
      "WRP",
      { value: ethers.utils.parseEther("1") }
    );

    const wrapPerRt = await exchange.WRAP_PER_RT();
    const buyAmount = RT_UNIT.mul(wrapPerRt);
    const baseCost = await exchange.calculateBuyPrice(wrapperAddress, buyAmount);
    const feeBps = await exchange.TRADE_FEE_BPS();
    const fee = baseCost.mul(feeBps).add(10000 - 1).div(10000);
    const totalCost = baseCost.add(fee);

    const blockNum = await ethers.provider.getBlockNumber();
    const blockData = await ethers.provider.getBlock(blockNum);
    const deadline = blockData.timestamp + 3600;

    await expect(exchange.connect(trader).buy(wrapperAddress, buyAmount, totalCost, deadline, trader.address, { value: totalCost }))
      .to.emit(exchange, "TokensPurchased");

    const pending = await exchange.pendingWithdrawals(rejectTreasury.address);
    expect(pending).to.be.gt(0);

    const traderBalBefore = await ethers.provider.getBalance(trader.address);
    await expect(rejectTreasury.claimPending(exchange.address, trader.address)).to.not.be.reverted;
    const traderBalAfter = await ethers.provider.getBalance(trader.address);

    expect(traderBalAfter.sub(traderBalBefore)).to.equal(pending);
    expect(await exchange.pendingWithdrawals(rejectCreator.address)).to.equal(0);

    await expect(exchange.connect(trader).withdrawPending(trader.address)).to.be.revertedWithCustomError(
      exchange,
      "InvalidAmount"
    );
  });
});

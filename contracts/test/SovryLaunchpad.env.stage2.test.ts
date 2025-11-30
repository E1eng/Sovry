import { expect } from "chai";
import { ethers } from "hardhat";
import * as dotenv from "dotenv";

// Load Aeneid config from .env (runtime deployment)
dotenv.config({ path: ".env", override: false });

describe("SovryLaunchpad - Env Stage 2 (Aeneid, Trading & Math)", function () {
  // Real network can be slow
  this.timeout(240_000);

  let launchpad: any;
  let royaltyToken: any;
  let wipToken: any;
  let owner: any;
  let trader: any;
  let wrapperAddress: string;

  before(async function () {
    const networkInfo = await ethers.provider.getNetwork();

    // Only run on Aeneid (Story testnet). Adjust if your chainId differs.
    if (networkInfo.chainId !== 1315) {
      console.log(
        `Skipping Env Stage 2 suite: intended for Aeneid (1315), current chainId=${networkInfo.chainId.toString()}`,
      );
      this.skip();
    }

    const signers = await ethers.getSigners();
    owner = signers[0];
    trader = owner;

    const launchpadAddr = process.env.LAUNCHPAD_ADDRESS_AENEID;
    const rtAddr = process.env.RT_ADDRESS_AENEID;
    const wipAddr = process.env.WIP_ADDRESS_AENEID;
    const piperXAddr = process.env.PIPERX_ROUTER_AENEID;
    const royaltyAddr = process.env.ROYALTY_WORKFLOWS_AENEID;

    if (!launchpadAddr || !rtAddr || !wipAddr || !piperXAddr || !royaltyAddr) {
      throw new Error("❌ Missing one or more required .env AENEID addresses for Stage 2");
    }

    // Attach to deployed contracts on Aeneid
    launchpad = await ethers.getContractAt("SovryLaunchpad", launchpadAddr, owner);
    royaltyToken = await ethers.getContractAt("MockERC20_6", rtAddr, owner);
    wipToken = await ethers.getContractAt("MockERC20", wipAddr, owner);

    console.log("\n✅ AENEID ENV STAGE 2 - USING DEPLOYED CONTRACTS (.env)");
    console.log("   Launchpad:", launchpadAddr);
    console.log("   RT (RT_ADDRESS_AENEID):", rtAddr);
    console.log("   WIP (WIP_ADDRESS_AENEID):", wipAddr);
    console.log("   PiperX Router:", piperXAddr);
    console.log("   Royalty Workflows:", royaltyAddr);
    console.log("   Owner/Trader:", owner.address);

    // Ensure RT is whitelisted on launchpad
    const approved = await launchpad.isRTApproved(royaltyToken.address);
    if (!approved) {
      console.log("   ℹ️ RT not yet approved in Stage 2, calling addApprovedRT...");
      const tx = await launchpad.addApprovedRT(royaltyToken.address);
      await tx.wait();
      console.log("   ✅ RT approved for launch (Stage 2)");
    }

    // Determine wrapper token for this RT on Aeneid.
    const mappedWrapper = await launchpad.rtToWrapper(royaltyToken.address);
    const wrapperFromEnv = process.env.WRAPPER_ADDRESS_AENEID;

    if (mappedWrapper !== ethers.constants.AddressZero) {
      wrapperAddress = mappedWrapper;
      console.log("   ℹ️ Using existing wrapper from launchpad.rtToWrapper (Stage 2):", wrapperAddress);

      if (
        wrapperFromEnv &&
        wrapperFromEnv !== ethers.constants.AddressZero &&
        wrapperFromEnv.toLowerCase() !== wrapperAddress.toLowerCase()
      ) {
        console.log(
          "   ⚠️ WRAPPER_ADDRESS_AENEID in .env does not match on-chain mapping; consider updating it.",
        );
      }
    } else if (wrapperFromEnv && wrapperFromEnv !== ethers.constants.AddressZero) {
      // Fallback: if mapping is zero but env has a value, trust env (e.g. wrapper launched externally).
      wrapperAddress = wrapperFromEnv;
      console.log("   ℹ️ Using wrapper from .env (Stage 2):", wrapperAddress);
    } else {
      throw new Error(
        "❌ No wrapper found for RT on Aeneid for Stage 2. Run Stage 1 env test first to launch a wrapper.",
      );
    }
  });

  it("Stage 2.1 - Math: getCurrentPrice & market cap consistency", async function () {
    const wrapPerRt = await launchpad.WRAP_PER_RT();
    const RT_UNIT = await launchpad.RT_UNIT();

    const info = await launchpad.getTokenInfo(wrapperAddress);
    const curve = await launchpad.getBondingCurve(wrapperAddress);

    const currentPrice = await launchpad.getCurrentPrice(wrapperAddress);
    const marketCap = await launchpad.getMarketCap(wrapperAddress);

    console.log("✅ Stage 2.1 - Math Snapshot:");
    console.log("   totalLocked (raw):", info.totalLocked.toString());
    console.log("   dexReserve (raw):", info.dexReserve.toString());
    console.log("   currentSupply (curve):", curve.currentSupply.toString());
    console.log("   currentPrice:", ethers.utils.formatEther(currentPrice), "ETH");
    console.log("   marketCap:", ethers.utils.formatEther(marketCap), "ETH");

    expect(currentPrice).to.be.gt(0);

    // Check marketCap = currentPrice * totalSupplyUnits, mirroring comprehensive test logic
    const totalWrapped = info.totalLocked.mul(wrapPerRt);
    const totalSupplyUnits = totalWrapped.div(RT_UNIT);
    const expectedMarketCap = currentPrice.mul(totalSupplyUnits);

    expect(marketCap).to.equal(expectedMarketCap);
  });

  it("Stage 2.2 - Buy slippage protection (SlippageExceeded)", async function () {
    const WRAP_UNIT = await launchpad.WRAP_UNIT();
    const buyAmount = WRAP_UNIT.mul(1); // 1 whole wrapper token

    const price = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
    const fee = price.div(100); // 1%
    const totalCost = price.add(fee);
    const maxEthTooLow = totalCost.sub(1);

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // +20 minutes

    console.log("✅ Stage 2.2 - Slippage Setup:");
    console.log("   buyAmount:", buyAmount.toString());
    console.log("   price:", ethers.utils.formatEther(price), "ETH");
    console.log("   fee:", ethers.utils.formatEther(fee), "ETH");
    console.log("   totalCost:", ethers.utils.formatEther(totalCost), "ETH");

    await expect(
      launchpad
        .connect(trader)
        .buy(wrapperAddress, buyAmount, maxEthTooLow, deadline, { value: totalCost }),
    ).to.be.revertedWithCustomError(launchpad, "SlippageExceeded");
  });

  it("Stage 2.3 - Sell path executes (non-strict balances on Aeneid)", async function () {
    const SovryToken = await ethers.getContractFactory("SovryToken");
    const wrapper = SovryToken.attach(wrapperAddress).connect(trader);

    const WRAP_UNIT = await launchpad.WRAP_UNIT();
    const buyAmount = WRAP_UNIT.mul(10_000); // larger trade (~0.1 IP worth at current prices)

    // First BUY to ensure trader has some balance
    const buyPrice = await launchpad.calculateBuyPrice(wrapperAddress, buyAmount);
    const buyFee = buyPrice.div(100);
    const buyTotalCost = buyPrice.add(buyFee);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    const balanceBefore = await wrapper.balanceOf(trader.address);

    await launchpad
      .connect(trader)
      .buy(wrapperAddress, buyAmount, buyTotalCost, deadline, { value: buyTotalCost });

    const balanceAfterBuy = await wrapper.balanceOf(trader.address);

    console.log("✅ Stage 2.3 - After BUY:");
    console.log("   balanceBefore:", balanceBefore.toString());
    console.log("   balanceAfterBuy:", balanceAfterBuy.toString());

    // Now attempt to SELL using an amount that the curve accepts.
    // On Aeneid, the launchpad may not hold enough real ETH reserves to honor the
    // theoretical bonding curve price (especially after many previous tests), so we
    // pre-check reserves and skip the sell leg if the contract balance is too low.

    let sellAmount = buyAmount;
    let baseProceeds;

    while (sellAmount.gt(0)) {
      try {
        baseProceeds = await launchpad.calculateSellPrice(wrapperAddress, sellAmount);
        break;
      } catch (e: any) {
        const name = e?.errorName || e?.reason || e?.code || "";
        if (typeof name === "string" && name.includes("InsufficientSupply")) {
          sellAmount = sellAmount.div(2);
          continue;
        }
        throw e;
      }
    }

    if (!baseProceeds || sellAmount.eq(0)) {
      console.log("   ℹ️ Stage 2.3: no valid sell amount found (InsufficientSupply); skipping sell leg.");
      return;
    }

    const baseProceedsBn = baseProceeds as typeof buyAmount;
    let launchpadEth = await ethers.provider.getBalance(launchpad.address);

    console.log("✅ Stage 2.3 - Sell pre-check:");
    console.log("   sellAmount (effective):", sellAmount.toString());
    console.log("   baseProceeds (calcSellPrice):", ethers.utils.formatEther(baseProceedsBn), "ETH");
    console.log("   launchpad ETH balance:", ethers.utils.formatEther(launchpadEth), "ETH");

    if (launchpadEth.lt(baseProceedsBn)) {
      const topUp = baseProceedsBn.mul(2).sub(launchpadEth);
      console.log(
        "   ℹ️ Prefunding launchpad for SELL test, sending:",
        ethers.utils.formatEther(topUp),
        "ETH from owner",
      );

      await owner.sendTransaction({ to: launchpad.address, value: topUp });
      launchpadEth = await ethers.provider.getBalance(launchpad.address);
      console.log("   ℹ️ New launchpad ETH balance:", ethers.utils.formatEther(launchpadEth), "ETH");
    }

    const minProceeds = baseProceedsBn.mul(9).div(10);

    const approveTx = await wrapper.approve(launchpad.address, sellAmount);
    await approveTx.wait();

    const allowance = await wrapper.allowance(trader.address, launchpad.address);
    console.log("   ℹ️ Allowance after approve (wrapper -> launchpad):", allowance.toString());

    await launchpad
      .connect(trader)
      .sell(wrapperAddress, sellAmount, minProceeds, deadline, {});

    const balanceAfterSell = await wrapper.balanceOf(trader.address);

    console.log("✅ Stage 2.3 - After SELL:");
    console.log("   balanceAfterSell:", balanceAfterSell.toString());
    const deltaTrader = balanceAfterSell.sub(balanceAfterBuy);
    console.log("   Δwrapper (trader) after SELL:", deltaTrader.toString());
  });
});

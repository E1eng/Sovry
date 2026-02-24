import { ethers } from "hardhat";
import hre from "hardhat";
import fs from "fs";
import path from "path";

// Story Protocol RoyaltyModule addresses (do not override with env)
// Source: https://docs.story.foundation/developers/deployed-smart-contracts
const STORY_ROYALTY_MODULE: Record<string, string> = {
  mainnet: "0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086",
  aeneid: "0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086",
};

async function main() {
  console.log("🚀 Deploying Sovry Protocol to", hre.network.name);

  const [deployer] = await ethers.getSigners();
  const balance = await deployer.provider!.getBalance(deployer.address);

  console.log("👤 Deployer:", deployer.address);
  console.log("💰 Balance:", ethers.utils.formatEther(balance));

  // Read constructor arguments from environment
  const treasury = process.env.TREASURY_ADDRESS;
  const piperXV3Factory = process.env.PIPERX_V3_FACTORY || process.env.PIPERX_V3_FACTORY_AENEID;
  const piperXV3SwapRouter = process.env.PIPERX_V3_SWAP_ROUTER || process.env.PIPERX_V3_SWAP_ROUTER_AENEID;
  const piperXV3PositionManager =
    process.env.PIPERX_V3_POSITION_MANAGER || process.env.PIPERX_V3_POSITION_MANAGER_AENEID;
  // Use Story Protocol RoyaltyModule (NOT Sovry contracts / random env overrides)
  const royaltyWorkflows =
    STORY_ROYALTY_MODULE[hre.network.name] || process.env.ROYALTY_WORKFLOWS || process.env.ROYALTY_WORKFLOWS_AENEID;
  const wipToken = process.env.WIP_ADDRESS || process.env.WIP_ADDRESS_AENEID;
  const keeperAddress = process.env.KEEPER_ADDRESS || deployer.address;
  const shouldVerify = !!process.env.STORYSCAN_API_KEY && process.env.SKIP_AUTO_VERIFY !== "true";
  // Defaults target: marketCap 10,000 IP at ~0.01 IP/token with ~3,000 IP curve raise.
  const curveBasePriceWei = process.env.CURVE_BASE_PRICE_WEI || "2500000000000000"; // 0.0025 IP
  const curvePriceIncrementWei = process.env.CURVE_PRICE_INCREMENT_WEI || "15625000000"; // 0.000000015625 IP

  if (!treasury || !piperXV3Factory || !piperXV3SwapRouter || !piperXV3PositionManager || !royaltyWorkflows || !wipToken) {
    throw new Error(
      "Missing one or more required env vars: TREASURY_ADDRESS, PIPERX_V3_FACTORY, PIPERX_V3_SWAP_ROUTER, PIPERX_V3_POSITION_MANAGER, WIP_ADDRESS"
    );
  }

  // Graduation threshold in ETH (default 1 ETH if not provided)
  const graduationThresholdEth = process.env.GRADUATION_THRESHOLD_ETH || "10000";
  const graduationThreshold = ethers.utils.parseEther(graduationThresholdEth);

  console.log("📦 Deploying contracts with args:");
  console.log("  treasury:", treasury);
  console.log("  piperXV3Factory:", piperXV3Factory);
  console.log("  piperXV3SwapRouter:", piperXV3SwapRouter);
  console.log("  piperXV3PositionManager:", piperXV3PositionManager);
  console.log("  royaltyWorkflows (Story RoyaltyModule):", royaltyWorkflows);
  console.log("  wipToken:", wipToken);
  console.log("  graduationThreshold (ETH):", graduationThresholdEth);
  console.log("  keeper:", keeperAddress);
  console.log("  initialOwner:", deployer.address);
  console.log("  curveBasePriceWei:", curveBasePriceWei);
  console.log("  curvePriceIncrementWei:", curvePriceIncrementWei);

  // Optional: deploy BondingCurveLib (most calls are internal/pure and won't require linking)
  const BondingCurveLib = await ethers.getContractFactory("BondingCurveLib");
  const bondingCurveLib = await BondingCurveLib.deploy();
  await bondingCurveLib.deployed();
  console.log("✅ BondingCurveLib deployed at:", bondingCurveLib.address);

  const SovryExchange = await ethers.getContractFactory("SovryExchange");
  const exchange = await SovryExchange.deploy(
    treasury,
    piperXV3Factory,
    piperXV3SwapRouter,
    piperXV3PositionManager,
    royaltyWorkflows,
    wipToken,
    graduationThreshold,
    deployer.address
  );
  await exchange.deployed();
  const exchangeReceipt = await exchange.deployTransaction.wait();
  console.log("✅ SovryExchange deployed at:", exchange.address);

  const SovryFactory = await ethers.getContractFactory("SovryFactory");
  const factory = await SovryFactory.deploy(exchange.address);
  await factory.deployed();
  const factoryReceipt = await factory.deployTransaction.wait();
  console.log("✅ SovryFactory deployed at:", factory.address);

  const weth = wipToken;
  console.log("ℹ️ WETH/WIP:", weth);

  const SovryRouter = await ethers.getContractFactory("SovryRouter");
  const router = await SovryRouter.deploy(factory.address, exchange.address, weth);
  await router.deployed();
  const routerReceipt = await router.deployTransaction.wait();
  console.log("✅ SovryRouter deployed at:", router.address);

  console.log("🔐 Wiring permissions...");
  await (await exchange.setFactory(factory.address)).wait();
  await (await exchange.setRouter(router.address)).wait();

  const keeperRole = await exchange.KEEPER_ROLE();
  await (await exchange.grantRole(keeperRole, keeperAddress)).wait();
  console.log("✅ Granted KEEPER_ROLE to:", keeperAddress);

  console.log("⚙️ Setting global curve params...");
  await (
    await exchange.setCurveParams(
      ethers.BigNumber.from(curveBasePriceWei),
      ethers.BigNumber.from(curvePriceIncrementWei)
    )
  ).wait();
  console.log("✅ Curve parameters finalized");

  if (shouldVerify) {
    console.log("🔍 STORYSCAN verification enabled (STORYSCAN_API_KEY detected)");
    await verifyContract("BondingCurveLib", bondingCurveLib.address, [], "src/libraries/BondingCurveLib.sol:BondingCurveLib");
    await verifyContract("SovryExchange", exchange.address, [
      treasury,
      piperXV3Factory,
      piperXV3SwapRouter,
      piperXV3PositionManager,
      royaltyWorkflows,
      wipToken,
      graduationThreshold,
      deployer.address,
    ]);
    await verifyContract("SovryFactory", factory.address, [exchange.address]);
    await verifyContract("SovryRouter", router.address, [factory.address, exchange.address, wipToken]);
  } else {
    console.log("ℹ️ STORYSCAN verification skipped (set STORYSCAN_API_KEY and omit SKIP_AUTO_VERIFY to enable)");
  }

  console.log("\n=== Deployment Summary ===");
  console.log("BondingCurveLib:", bondingCurveLib.address);
  console.log("SovryExchange  :", exchange.address);
  console.log("SovryFactory   :", factory.address);
  console.log("SovryRouter    :", router.address);

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const deployment = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployer.address,
    config: {
      treasury,
      piperXV3Factory,
      piperXV3SwapRouter,
      piperXV3PositionManager,
      royaltyWorkflows,
      wipToken,
      weth,
      graduationThreshold: graduationThreshold.toString(),
      keeper: keeperAddress,
    },
    contracts: {
      BondingCurveLib: bondingCurveLib.address,
      SovryExchange: exchange.address,
      SovryFactory: factory.address,
      SovryRouter: router.address,
    },
    blocks: {
      BondingCurveLib: bondingCurveLib.deployTransaction.blockNumber,
      SovryExchange: exchangeReceipt.blockNumber,
      SovryFactory: factoryReceipt.blockNumber,
      SovryRouter: routerReceipt.blockNumber,
      subgraphStartBlock: factoryReceipt.blockNumber,
    },
  };

  const outPath = path.join(deploymentsDir, `${hre.network.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log("📝 Saved deployment file:", outPath);
}

async function verifyContract(label: string, address: string, constructorArgs: any[], contractPath?: string) {
  try {
    console.log(`🧾 Verifying ${label} @ ${address}`);
    await hre.run("verify:verify", {
      address,
      constructorArguments: constructorArgs,
      contract: contractPath,
    });
    console.log(`✅ ${label} verified`);
  } catch (error: any) {
    const message = error?.message || String(error);
    if (message.includes("Already Verified")) {
      console.log(`ℹ️ ${label} already verified`);
      return;
    }
    console.warn(`⚠️ Verification skipped for ${label}:`, message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Launchpad deployment failed:", error);
    process.exit(1);
  });

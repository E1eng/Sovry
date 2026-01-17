import { ethers } from "hardhat";
import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚀 Deploying Sovry Protocol to", hre.network.name);

  const [deployer] = await ethers.getSigners();
  const balance = await deployer.provider!.getBalance(deployer.address);

  console.log("👤 Deployer:", deployer.address);
  console.log("💰 Balance:", ethers.utils.formatEther(balance));

  // Read constructor arguments from environment
  const treasury = process.env.TREASURY_ADDRESS;
  const piperXRouter = process.env.PIPERX_ROUTER_AENEID;
  const royaltyWorkflows = process.env.ROYALTY_WORKFLOWS_AENEID;
  const wipToken = process.env.WIP_ADDRESS_AENEID;
  const keeperAddress = process.env.KEEPER_ADDRESS || deployer.address;

  if (!treasury || !piperXRouter || !royaltyWorkflows || !wipToken) {
    throw new Error(
      "Missing one or more required env vars: TREASURY_ADDRESS, PIPERX_ROUTER_AENEID, ROYALTY_WORKFLOWS_AENEID, WIP_ADDRESS_AENEID"
    );
  }

  // Graduation threshold in ETH (default 1 ETH if not provided)
  const graduationThresholdEth = process.env.GRADUATION_THRESHOLD_ETH || "2000";
  const graduationThreshold = ethers.utils.parseEther(graduationThresholdEth);

  console.log("📦 Deploying contracts with args:");
  console.log("  treasury:", treasury);
  console.log("  piperXRouter:", piperXRouter);
  console.log("  royaltyWorkflows:", royaltyWorkflows);
  console.log("  wipToken:", wipToken);
  console.log("  graduationThreshold (ETH):", graduationThresholdEth);
  console.log("  keeper:", keeperAddress);
  console.log("  initialOwner:", deployer.address);

  // Optional: deploy BondingCurveLib (most calls are internal/pure and won't require linking)
  const BondingCurveLib = await ethers.getContractFactory("BondingCurveLib");
  const bondingCurveLib = await BondingCurveLib.deploy();
  await bondingCurveLib.deployed();
  console.log("✅ BondingCurveLib deployed at:", bondingCurveLib.address);

  const SovryExchange = await ethers.getContractFactory("SovryExchange");
  const exchange = await SovryExchange.deploy(
    treasury,
    piperXRouter,
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

  const piperRouter = new ethers.Contract(
    piperXRouter,
    ["function WETH() external view returns (address)", "function factory() external view returns (address)"],
    deployer
  );
  const weth = await piperRouter.WETH();
  console.log("ℹ️ PiperX WETH:", weth);

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
      piperXRouter,
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Launchpad deployment failed:", error);
    process.exit(1);
  });

import { ethers } from "hardhat";
import hre from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Redeploy SovryExchange with correct Story Protocol RoyaltyModule address.
 * 
 * Previous deployment used wrong royaltyWorkflows address:
 * - Wrong: 0x9515faE61E0c0447C6AC6dEe5628A2097aFE1890 (Sovry internal)
 * - Correct: 0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086 (Story RoyaltyModule)
 * 
 * This script deploys new Exchange with correct address and saves to deployments.
 */

// Story Protocol RoyaltyModule addresses
const ROYALTY_MODULE = {
  mainnet: "0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086",
  aeneid: "0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086", // Same address on both
};

async function main() {
  const network = hre.network.name;
  console.log(`Redeploying SovryExchange on ${network}...`);

  // Load existing deployment for other contract addresses
  const deploymentPath = path.join(__dirname, "../deployments", `${network}.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  
  // Verify we have required addresses
  const required = ["treasury", "piperXV3Factory", "piperXV3SwapRouter", 
                    "piperXV3PositionManager", "wipToken", "graduationThreshold"];
  for (const key of required) {
    if (!deployment.config[key]) {
      throw new Error(`Missing ${key} in deployment config`);
    }
  }

  const config = deployment.config;
  const royaltyModule = ROYALTY_MODULE[network as keyof typeof ROYALTY_MODULE];
  
  if (!royaltyModule) {
    throw new Error(`RoyaltyModule address not defined for network: ${network}`);
  }

  console.log("\nDeployment config:");
  console.log("  Treasury:", config.treasury);
  console.log("  PiperX Factory:", config.piperXV3Factory);
  console.log("  PiperX SwapRouter:", config.piperXV3SwapRouter);
  console.log("  PiperX PositionManager:", config.piperXV3PositionManager);
  console.log("  RoyaltyModule (Story):", royaltyModule);
  console.log("  WIP Token:", config.wipToken);
  console.log("  Graduation Threshold:", config.graduationThreshold);

  const [deployer] = await ethers.getSigners();
  console.log("\nDeployer:", deployer.address);

  // Deploy SovryExchange
  console.log("\nDeploying SovryExchange...");
  const SovryExchange = await ethers.getContractFactory("SovryExchange");
  const exchange = await SovryExchange.deploy(
    config.treasury,
    config.piperXV3Factory,
    config.piperXV3SwapRouter,
    config.piperXV3PositionManager,
    royaltyModule, // Correct Story RoyaltyModule address
    config.wipToken,
    config.graduationThreshold,
    deployer.address // initialOwner
  );

  await exchange.deployed();
  console.log("SovryExchange deployed to:", exchange.address);

  // Update deployment file
  const newDeployment = {
    ...deployment,
    contracts: {
      ...deployment.contracts,
      SovryExchange: exchange.address,
    },
    blocks: {
      ...deployment.blocks,
      SovryExchange: await ethers.provider.getBlockNumber(),
    },
  };

  fs.writeFileSync(deploymentPath, JSON.stringify(newDeployment, null, 2));
  console.log("\nUpdated deployment file:", deploymentPath);

  // Verify on Storyscan (if mainnet/aeneid)
  if (network === "mainnet" || network === "aeneid") {
    console.log("\nWaiting for block confirmations before verification...");
    await new Promise(r => setTimeout(r, 15000)); // Wait 15s

    try {
      await hre.run("verify:verify", {
        address: exchange.address,
        constructorArguments: [
          config.treasury,
          config.piperXV3Factory,
          config.piperXV3SwapRouter,
          config.piperXV3PositionManager,
          royaltyModule,
          config.wipToken,
          config.graduationThreshold,
          deployer.address,
        ],
      });
      console.log("Contract verified on Storyscan");
    } catch (err) {
      console.warn("Verification failed (may retry manually):", err);
    }
  }

  console.log("\n=== IMPORTANT NEXT STEPS ===");
  console.log("1. Update backend .env: SOVRY_EXCHANGE_ADDRESS=" + exchange.address);
  console.log("2. Update frontend .env: NEXT_PUBLIC_EXCHANGE_ADDRESS=" + exchange.address);
  console.log("3. Update keeper bot config with new Exchange address");
  console.log("4. Grant KEEPER_ROLE to bot address on new Exchange");
  console.log("5. Test harvest flow with: npx hardhat run scripts/test-harvest.ts --network " + network);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

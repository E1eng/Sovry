import { ethers } from "hardhat";
import hre from "hardhat";

async function main() {
  console.log("🚀 Deploying SovryLaunchpad to", hre.network.name);

  const [deployer] = await ethers.getSigners();
  const balance = await deployer.provider!.getBalance(deployer.address);

  console.log("👤 Deployer:", deployer.address);
  console.log("💰 Balance:", ethers.utils.formatEther(balance));

  const Launchpad = await ethers.getContractFactory("SovryLaunchpad");

  console.log("📦 Deploying SovryLaunchpad contract...");
  const launchpad = await Launchpad.deploy();
  await launchpad.deployed();

  console.log("✅ SovryLaunchpad deployed at:", launchpad.address);

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("🔎 Attempting verification on", hre.network.name);
    try {
      await hre.run("verify:verify", {
        address: launchpad.address,
        constructorArguments: [],
      });
      console.log("✅ Contract verified successfully");
    } catch (verifyError: any) {
      console.warn("⚠️ Verification failed or skipped:", verifyError.message || verifyError);
    }
  } else {
    console.log("ℹ️ Verification skipped for local network.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Launchpad deployment failed:", error);
    process.exit(1);
  });

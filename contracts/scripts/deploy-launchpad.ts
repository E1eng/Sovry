import { ethers } from "hardhat";
import hre from "hardhat";

async function main() {
  console.log("🚀 Deploying SovryLaunchpad to", hre.network.name);

  const [deployer] = await ethers.getSigners();
  const balance = await deployer.provider!.getBalance(deployer.address);

  console.log("👤 Deployer:", deployer.address);
  console.log("💰 Balance:", ethers.utils.formatEther(balance));

  const Launchpad = await ethers.getContractFactory("SovryLaunchpad");

  // Read constructor arguments from environment
  const treasury = process.env.TREASURY_ADDRESS;
  const piperXRouter = process.env.PIPERX_ROUTER_AENEID;
  const royaltyWorkflows = process.env.ROYALTY_WORKFLOWS_AENEID;
  const wipToken = process.env.WIP_ADDRESS_AENEID;

  if (!treasury || !piperXRouter || !royaltyWorkflows || !wipToken) {
    throw new Error(
      "Missing one or more required env vars: TREASURY_ADDRESS, PIPERX_ROUTER_AENEID, ROYALTY_WORKFLOWS_AENEID, WIP_ADDRESS_AENEID"
    );
  }

  // Graduation threshold in ETH (default 1 ETH if not provided)
  const graduationThresholdEth = process.env.GRADUATION_THRESHOLD_ETH || "0.8";
  const graduationThreshold = ethers.utils.parseEther(graduationThresholdEth);

  console.log("📦 Deploying SovryLaunchpad contract with args:");
  console.log("  treasury:", treasury);
  console.log("  piperXRouter:", piperXRouter);
  console.log("  royaltyWorkflows:", royaltyWorkflows);
  console.log("  wipToken:", wipToken);
  console.log("  graduationThreshold (ETH):", graduationThresholdEth);
  console.log("  initialOwner:", deployer.address);

  const launchpad = await Launchpad.deploy(
    treasury,
    piperXRouter,
    royaltyWorkflows,
    wipToken,
    graduationThreshold,
    deployer.address
  );
  await launchpad.deployed();

  console.log("✅ SovryLaunchpad deployed at:", launchpad.address);

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("🔎 Attempting verification on", hre.network.name);
    try {
      await hre.run("verify:verify", {
        address: launchpad.address,
        constructorArguments: [
          treasury,
          piperXRouter,
          royaltyWorkflows,
          wipToken,
          graduationThreshold,
          deployer.address,
        ],
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

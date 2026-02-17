import { ethers } from "hardhat";
import hre from "hardhat";

/**
 * Update the graduation threshold on SovryExchange.
 *
 * Usage:
 *   GRADUATION_THRESHOLD_ETH=0.5 npx hardhat run scripts/update-graduation-threshold.ts --network mainnet
 *
 * Requires PRIVATE_KEY in .env to be the DEFAULT_ADMIN_ROLE holder.
 */
async function main() {
  const network = hre.network.name;
  console.log(`Updating graduation threshold on ${network}`);

  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  // Load deployment
  const fs = await import("fs");
  const path = await import("path");
  const deploymentPath = path.join(__dirname, "..", "deployments", `${network}.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`No deployment file found at ${deploymentPath}`);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const exchangeAddress = deployment.contracts.SovryExchange;
  if (!exchangeAddress) {
    throw new Error("SovryExchange address not found in deployment file");
  }

  const thresholdEth = process.env.GRADUATION_THRESHOLD_ETH;
  if (!thresholdEth) {
    throw new Error("GRADUATION_THRESHOLD_ETH env var is required (e.g. 0.5)");
  }

  const newThreshold = ethers.utils.parseEther(thresholdEth);
  console.log(`Exchange: ${exchangeAddress}`);
  console.log(`New threshold: ${thresholdEth} IP (${newThreshold.toString()} wei)`);

  const exchangeAbi = [
    "function graduationThreshold() view returns (uint256)",
    "function updateGraduationThreshold(uint256 newThreshold) external",
  ];

  const exchange = new ethers.Contract(exchangeAddress, exchangeAbi, signer);

  const currentThreshold = await exchange.graduationThreshold();
  console.log(`Current threshold: ${ethers.utils.formatEther(currentThreshold)} IP`);

  if (currentThreshold.eq(newThreshold)) {
    console.log("Threshold already set to target value. Nothing to do.");
    return;
  }

  console.log("Sending updateGraduationThreshold tx...");
  const tx = await exchange.updateGraduationThreshold(newThreshold);
  console.log(`TX hash: ${tx.hash}`);
  await tx.wait();
  console.log("Graduation threshold updated successfully!");

  // Verify
  const updated = await exchange.graduationThreshold();
  console.log(`Verified new threshold: ${ethers.utils.formatEther(updated)} IP`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to update graduation threshold:", error);
    process.exit(1);
  });

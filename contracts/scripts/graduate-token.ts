import { ethers } from "hardhat";
import hre from "hardhat";

/**
 * Graduate a wrapper token once market cap meets threshold.
 *
 * Usage:
 *   WRAPPER_TOKEN=0x... npx hardhat run scripts/graduate-token.ts --network mainnet
 *
 * Requires PRIVATE_KEY in .env to be an address with KEEPER_ROLE (not just any address).
 * The graduate() function is now restricted to KEEPER_ROLE only.
 */
async function main() {
  const network = hre.network.name;
  console.log(`Graduating token on ${network}`);

  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const wrapperToken = process.env.WRAPPER_TOKEN;
  if (!wrapperToken || !ethers.utils.isAddress(wrapperToken)) {
    throw new Error("WRAPPER_TOKEN env var is required and must be a valid address");
  }

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

  const exchangeAbi = [
    "function graduationThreshold() view returns (uint256)",
    "function getMarketCap(address wrapperToken) view returns (uint256)",
    "function graduate(address wrapperToken) external",
  ];

  const exchange = new ethers.Contract(exchangeAddress, exchangeAbi, signer);

  const threshold = await exchange.graduationThreshold();
  const marketCap = await exchange.getMarketCap(wrapperToken);

  console.log(`Exchange: ${exchangeAddress}`);
  console.log(`Wrapper: ${wrapperToken}`);
  console.log(`Graduation threshold: ${ethers.utils.formatEther(threshold)} IP`);
  console.log(`Market cap: ${ethers.utils.formatEther(marketCap)} IP`);

  if (marketCap.lt(threshold)) {
    throw new Error("Market cap is below graduation threshold. Aborting.");
  }

  console.log("Sending graduate() tx...");
  const tx = await exchange.graduate(wrapperToken);
  console.log(`TX hash: ${tx.hash}`);
  await tx.wait();
  console.log("Graduation completed.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to graduate token:", error);
    process.exit(1);
  });

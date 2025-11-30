import { ethers } from "hardhat";
import hre from "hardhat";

async function main() {
  console.log("🚀 Deploying TestRT100 to", hre.network.name);

  const [deployer] = await ethers.getSigners();
  const balance = await deployer.provider!.getBalance(deployer.address);

  console.log("👤 Deployer:", deployer.address);
  console.log("💰 Balance:", ethers.utils.formatEther(balance));

  const name = process.env.RT_TEST_NAME || "Test Royalty 100";
  const symbol = process.env.RT_TEST_SYMBOL || "RT100";

  const TestRT100 = await ethers.getContractFactory("TestRT100");
  const rt = await TestRT100.deploy(name, symbol);
  await rt.deployed();

  console.log("✅ TestRT100 deployed at:", rt.address);
  console.log("   Name:", name);
  console.log("   Symbol:", symbol);
  console.log("   Total supply (raw): 100 * 10^6 = 100000000");

  console.log("\n👉 Set this in .env as:");
  console.log('RT_ADDRESS_AENEID="' + rt.address + '"');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ RT test deployment failed:", error);
    process.exit(1);
  });
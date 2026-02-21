import { ethers } from "hardhat";
import hre from "hardhat";

/**
 * Grant KEEPER_ROLE to bot/keeper address on new SovryExchange
 */

const KEEPER_ADDRESS = process.env.KEEPER_ADDRESS || "0x5dacCA2057e3B317C9e148C4fE4B8b794D46bD80"; // Default keeper from deployment

async function main() {
  const network = hre.network.name;
  
  // Load deployment
  const deployment = require(`../deployments/${network}.json`);
  const EXCHANGE_ADDRESS = deployment.contracts.SovryExchange;
  
  console.log("Network:", network);
  console.log("Exchange:", EXCHANGE_ADDRESS);
  console.log("Keeper to grant:", KEEPER_ADDRESS);

  const [admin] = await ethers.getSigners();
  console.log("Admin (granting role):", admin.address);

  const exchange = await ethers.getContractAt("SovryExchange", EXCHANGE_ADDRESS, admin);

  const KEEPER_ROLE = await exchange.KEEPER_ROLE();
  console.log("KEEPER_ROLE bytes32:", KEEPER_ROLE);

  // Check if already has role
  const hasRole = await exchange.hasRole(KEEPER_ROLE, KEEPER_ADDRESS);
  if (hasRole) {
    console.log("Keeper already has KEEPER_ROLE");
    return;
  }

  console.log("\nGranting KEEPER_ROLE...");
  const tx = await exchange.grantRole(KEEPER_ROLE, KEEPER_ADDRESS);
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("✓ KEEPER_ROLE granted");

  // Verify
  const check = await exchange.hasRole(KEEPER_ROLE, KEEPER_ADDRESS);
  console.log("Verification:", check ? "SUCCESS" : "FAILED");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

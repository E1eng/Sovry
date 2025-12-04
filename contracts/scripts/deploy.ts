import { ethers } from "hardhat";

async function main() {
  const NFT = await ethers.getContractFactory("OGSoulboundNFT"); // match this exactly
  const nft = await NFT.deploy();
  console.log("OGSoulboundNFT deployed to:", nft.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { ethers } from "hardhat";

/**
 * Simple script to inject ERC20 royalties into a Story IP Royalty Vault
 * using the RoyaltyTestHelper contract.
 *
 * This script DOES NOT call any Sovry contract harvest function.
 *
 * In the new architecture, harvest is performed by a keeper/bot via:
 * - `SovryExchange.harvest(wrapperToken)` (KEEPER_ROLE gated)
 *
 * The frontend flow is:
 * - claim Story revenue
 * - transfer WIP to the Exchange
 * The keeper then triggers `harvest` on the Exchange.
 */
async function main() {
  // TODO: isi semua parameter ini sebelum run

  // Alamat kontrak RoyaltyTestHelper yang sudah kamu deploy
  const ROYALTY_HELPER_ADDRESS = "0x92946d6EFb6e1506E98Bc63cAa7BC8C818541454";

  // Alamat RoyaltyModule Story (spender yang akan dituju approve WIP)
  const ROYALTY_MODULE_ADDRESS = "0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086";

  // Alamat token IP (WIP) yang dipakai sebagai royalty
  const CURRENCY_TOKEN = process.env.WIP_ADDRESS_AENEID;
  if (!CURRENCY_TOKEN) {
    throw new Error("Missing env WIP_ADDRESS_AENEID for IP currency token");
  }

  // IP ID child yang akan dibayar royalty-nya
  const CHILD_IP_ID = "0xEc2ECEd70029e6899F16324af0E1f44A7908fEc9";

  // Jumlah token yang mau di-inject (dalam smallest units, misal 1 * 10^decimals)
  const AMOUNT = ethers.utils.parseUnits("0.1", 18); // ganti 18 sesuai decimals token IP kamu

  const [signer] = await ethers.getSigners();
  console.log("Using signer:", signer.address);

  // Load ERC20 + helper
  const erc20 = await ethers.getContractAt("IERC20", CURRENCY_TOKEN, signer);
  const helper = await ethers.getContractAt(
    "RoyaltyTestHelper",
    ROYALTY_HELPER_ADDRESS,
    signer
  );

  console.log("Approving RoyaltyModule to spend tokens...");
  const approveTx = await erc20.approve(ROYALTY_MODULE_ADDRESS, AMOUNT);
  console.log("approve tx hash:", approveTx.hash);
  await approveTx.wait();
  console.log("Approve confirmed");

  console.log("Calling injectRoyaltyERC20...");
  const tx = await helper.injectRoyaltyERC20(CURRENCY_TOKEN, CHILD_IP_ID, AMOUNT);
  console.log("injectRoyaltyERC20 tx hash:", tx.hash);
  await tx.wait();
  console.log("Royalty injected successfully");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

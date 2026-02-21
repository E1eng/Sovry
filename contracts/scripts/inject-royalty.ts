import { ethers } from "hardhat";
import hre from "hardhat";

// Local deployment configs (used as sane defaults for contract addresses)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DEPLOYMENTS: Record<string, any> = {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  hardhat: require("../deployments/hardhat.json"),
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  aeneid: require("../deployments/aeneid.json"),
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  mainnet: require("../deployments/mainnet.json"),
};

function normalizeAddress(label: string, value: string): string {
  const v = String(value || "").trim();
  if (!v) throw new Error(`${label} is required`);
  if (!ethers.utils.isAddress(v)) {
    throw new Error(`${label} must be a valid 0x address (got: "${value}")`);
  }
  return ethers.utils.getAddress(v);
}

/**
 * Simple script to inject ERC20 royalties into a Story IP Royalty Vault
 * by calling Story's RoyaltyModule.payRoyaltyOnBehalf.
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
  const network = hre.network.name;
  const allowMainnet = String(process.env.ALLOW_MAINNET_INJECT_ROYALTY || "").toLowerCase() === "true";

  if (network === "mainnet" && !allowMainnet) {
    throw new Error(
      "Refusing to run inject-royalty.ts on mainnet. " +
        "Set ALLOW_MAINNET_INJECT_ROYALTY=true if you really intend to send a real transaction."
    );
  }

  const deployment = DEPLOYMENTS[network];

  // IMPORTANT: Use Story Protocol's RoyaltyModule, NOT Sovry's royaltyWorkflows
  // Mainnet: 0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086
  // Aeneid:  0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086 (same address on both networks)
  const ROYALTY_MODULE_ADDRESS = normalizeAddress(
    "ROYALTY_MODULE_ADDRESS",
    process.env.ROYALTY_MODULE_ADDRESS || "0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086"
  );

  // Currency token used for royalty payments (WIP or whitelisted MERC20)
  const CURRENCY_TOKEN = normalizeAddress(
    "CURRENCY_TOKEN",
    process.env.CURRENCY_TOKEN || process.env.WIP_ADDRESS_AENEID || deployment?.config?.wipToken
  );

  // IP ID child yang akan dibayar royalty-nya
  const CHILD_IP_ID = normalizeAddress("CHILD_IP_ID", "0xAA62756203047Ca9b6146934F4BB54D744c52A93");

  // Jumlah token yang mau di-inject (dalam smallest units, misal 1 * 10^decimals)
  const AMOUNT = ethers.utils.parseUnits("0.1", 18); // ganti 18 sesuai decimals token IP kamu

  const [signer] = await ethers.getSigners();
  console.log("Using signer:", signer.address);

  console.log("Network:", network);
  console.log("RoyaltyModule:", ROYALTY_MODULE_ADDRESS);
  console.log("Currency token:", CURRENCY_TOKEN);
  console.log("Child IP ID:", CHILD_IP_ID);

  // Load ERC20 + RoyaltyModule
  const erc20 = await ethers.getContractAt("IERC20", CURRENCY_TOKEN, signer);

  const royaltyModule = await ethers.getContractAt("IRoyaltyModule", ROYALTY_MODULE_ADDRESS, signer);

  // Optional: if using WIP and signer doesn't have enough WIP, wrap native IP -> WIP
  const isWip =
    deployment?.config?.wipToken &&
    String(deployment.config.wipToken).toLowerCase() === String(CURRENCY_TOKEN).toLowerCase();

  if (isWip) {
    const wip = await ethers.getContractAt("IWIP", CURRENCY_TOKEN, signer);
    const wipBal = await wip.balanceOf(signer.address);

    if (wipBal.lt(AMOUNT)) {
      const needed = AMOUNT.sub(wipBal);
      const nativeBal = await signer.getBalance();
      if (nativeBal.lt(needed)) {
        throw new Error(
          `Insufficient native IP to wrap into WIP. need=${ethers.utils.formatEther(needed)} IP have=${ethers.utils.formatEther(nativeBal)} IP`
        );
      }

      console.log(`Wrapping ${ethers.utils.formatEther(needed)} IP into WIP...`);
      const wrapTx = await wip.deposit({ value: needed });
      console.log("wrap tx hash:", wrapTx.hash);
      await wrapTx.wait();
      console.log("Wrap confirmed");
    }
  }

  console.log("Approving RoyaltyModule to spend tokens...");
  const approveTx = await erc20.approve(ROYALTY_MODULE_ADDRESS, AMOUNT);
  console.log("approve tx hash:", approveTx.hash);
  await approveTx.wait();
  console.log("Approve confirmed");

  const beforeSigner = await erc20.balanceOf(signer.address);
  const beforeChild = await erc20.balanceOf(CHILD_IP_ID);

  console.log("Calling payRoyaltyOnBehalf...");
  const tx = await royaltyModule.payRoyaltyOnBehalf(CHILD_IP_ID, signer.address, CURRENCY_TOKEN, AMOUNT);
  console.log("payRoyaltyOnBehalf tx hash:", tx.hash);
  await tx.wait();

  const afterSigner = await erc20.balanceOf(signer.address);
  const afterChild = await erc20.balanceOf(CHILD_IP_ID);

  console.log("Royalty injected successfully");
  console.log("Signer balance:", ethers.utils.formatUnits(beforeSigner, 18), "->", ethers.utils.formatUnits(afterSigner, 18));
  console.log("Child IP balance:", ethers.utils.formatUnits(beforeChild, 18), "->", ethers.utils.formatUnits(afterChild, 18));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

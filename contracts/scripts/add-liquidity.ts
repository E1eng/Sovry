import { ethers } from "hardhat";
import hre from "hardhat";

/**
 * Manually add liquidity to PiperX V3 pool after a GraduationFailed fallback.
 *
 * Usage:
 *   WRAPPER_TOKEN=0x... IP_AMOUNT=1.0 WRAPPER_AMOUNT=1000 \
 *   npx hardhat run scripts/add-liquidity.ts --network mainnet
 *
 * Notes:
 * - IP_AMOUNT is in native IP (18 decimals). It will be wrapped into WIP.
 * - WRAPPER_AMOUNT defaults to your full wrapper balance if omitted.
 */
async function main() {
  const network = hre.network.name;
  console.log(`Adding liquidity on ${network}`);

  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const wrapperToken = process.env.WRAPPER_TOKEN;
  const ipAmount = process.env.IP_AMOUNT;
  const wrapperAmountEnv = process.env.WRAPPER_AMOUNT;
  const fee = Number(process.env.PIPERX_FEE || "10000");

  if (!wrapperToken || !ethers.utils.isAddress(wrapperToken)) {
    throw new Error("WRAPPER_TOKEN env var is required and must be a valid address");
  }
  if (!ipAmount) {
    throw new Error("IP_AMOUNT env var is required (e.g. 0.25)");
  }

  const ipAmountWei = ethers.utils.parseEther(ipAmount);
  if (ipAmountWei.lte(0)) {
    throw new Error("IP_AMOUNT must be greater than 0");
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
    "function treasury() view returns (address)",
    "function piperXV3PositionManager() view returns (address)",
    "function piperXV3Factory() view returns (address)",
    "function wipToken() view returns (address)",
  ];

  const exchange = new ethers.Contract(exchangeAddress, exchangeAbi, signer);
  const treasury = await exchange.treasury();
  const positionManagerAddress = await exchange.piperXV3PositionManager();
  const factoryAddress = await exchange.piperXV3Factory();
  const wipToken = await exchange.wipToken();

  console.log("Exchange:", exchangeAddress);
  console.log("Treasury:", treasury);
  console.log("PositionManager:", positionManagerAddress);
  console.log("Factory:", factoryAddress);
  console.log("WIP:", wipToken);

  const erc20Abi = [
    "function balanceOf(address owner) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ];

  const wipAbi = [
    ...erc20Abi,
    "function deposit() payable",
  ];

  const factoryAbi = [
    "function feeAmountTickSpacing(uint24 fee) view returns (int24)",
    "function getPool(address token0, address token1, uint24 fee) view returns (address)",
  ];

  const positionManagerAbi = [
    "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
  ];

  const token = new ethers.Contract(wrapperToken, erc20Abi, signer);
  const wip = new ethers.Contract(wipToken, wipAbi, signer);
  const factory = new ethers.Contract(factoryAddress, factoryAbi, signer);
  const positionManager = new ethers.Contract(positionManagerAddress, positionManagerAbi, signer);

  const wrapperBalance = await token.balanceOf(signer.address);
  const wrapperAmountWei = wrapperAmountEnv
    ? ethers.utils.parseEther(wrapperAmountEnv)
    : wrapperBalance;

  if (wrapperAmountWei.lte(0)) {
    throw new Error("WRAPPER_AMOUNT resolved to 0. Provide a positive amount.");
  }
  if (wrapperAmountWei.gt(wrapperBalance)) {
    throw new Error("WRAPPER_AMOUNT exceeds signer balance.");
  }

  const wipBalBefore = await wip.balanceOf(signer.address);
  console.log(`Wrapping ${ipAmount} IP -> WIP...`);
  await (await wip.deposit({ value: ipAmountWei })).wait();
  const wipBalAfter = await wip.balanceOf(signer.address);
  const wipAmountWei = wipBalAfter.sub(wipBalBefore);

  if (wipAmountWei.lte(0)) {
    throw new Error("WIP balance did not increase. Deposit failed.");
  }

  const token0 = wrapperToken.toLowerCase() < wipToken.toLowerCase() ? wrapperToken : wipToken;
  const token1 = token0 === wrapperToken ? wipToken : wrapperToken;

  const pool = await factory.getPool(token0, token1, fee);
  if (pool === ethers.constants.AddressZero) {
    throw new Error("Pool does not exist. This script expects the pool to be initialized already.");
  }
  console.log("Pool:", pool);

  const tickSpacing = await factory.feeAmountTickSpacing(fee);
  const minTick = -887272;
  const maxTick = 887272;
  const nearestUsableTick = (tick: number, spacing: number, roundUp: boolean) => {
    const quotient = tick / spacing;
    const rounded = roundUp ? Math.ceil(quotient) : Math.floor(quotient);
    return rounded * spacing;
  };
  const tickLower = nearestUsableTick(minTick, tickSpacing, true);
  const tickUpper = nearestUsableTick(maxTick, tickSpacing, false);
  if (tickLower >= tickUpper) {
    throw new Error(`Invalid tick range computed: ${tickLower} >= ${tickUpper}`);
  }
  console.log(`Tick spacing: ${tickSpacing}`);
  console.log(`Tick range: [${tickLower}, ${tickUpper}]`);

  const amount0Desired = token0 === wrapperToken ? wrapperAmountWei : wipAmountWei;
  const amount1Desired = token1 === wrapperToken ? wrapperAmountWei : wipAmountWei;

  console.log("Approving tokens...");
  await (await token.approve(positionManagerAddress, wrapperAmountWei)).wait();
  await (await wip.approve(positionManagerAddress, wipAmountWei)).wait();

  const deadline = Math.floor(Date.now() / 1000) + 900;
  const params = {
    token0,
    token1,
    fee,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: 0,
    amount1Min: 0,
    recipient: signer.address,
    deadline,
  };

  console.log("Simulating mint...");
  const preview = await positionManager.callStatic.mint(params);
  console.log("Preview:", preview);

  console.log("Sending mint tx...");
  const tx = await positionManager.mint(params);
  console.log(`TX hash: ${tx.hash}`);
  await tx.wait();
  console.log("Liquidity added successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to add liquidity:", error);
    process.exit(1);
  });

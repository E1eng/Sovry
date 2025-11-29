import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "dotenv/config";

const AENEID_RPC_URL = process.env.AENEID_RPC_URL || "https://aeneid.storyrpc.io";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const TESTNET_PRIVATE_KEY = process.env.TESTNET_PRIVATE_KEY || "";
const OWNER_ADDRESS = process.env.OWNER_ADDRESS || "";
const STORYSCAN_API_KEY = process.env.STORYSCAN_API_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1, // Minimal runs value to reduce bytecode size for Mainnet deployment
      },
      viaIR: true, // Enable viaIR to handle stack depth
    },
  },
  paths: {
    // Treat this folder (./) as the Solidity sources directory so that
    // files like SovryLaunchpad.sol at the project root are compiled.
    sources: "./",
  },
  mocha: {
    timeout: 120000, // 2 minutes for testnet tests
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    aeneid: {
      url: AENEID_RPC_URL,
      chainId: 1315,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      gasPrice: 20000000000, // 20 gwei
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: TESTNET_PRIVATE_KEY ? [TESTNET_PRIVATE_KEY] : [],
      gasPrice: "auto",
    },
  },
  etherscan: {
    // For Storyscan, we treat it as an Etherscan-compatible custom chain
    apiKey: STORYSCAN_API_KEY,
    customChains: [
      {
        network: "aeneid",
        chainId: 1315,
        urls: {
          apiURL: "https://aeneid.storyscan.io/api",
          browserURL: "https://aeneid.storyscan.io",
        },
      },
    ],
  },
};

export default config;

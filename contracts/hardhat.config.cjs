require("@nomicfoundation/hardhat-chai-matchers");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("ts-node/register/transpile-only");
require("dotenv/config");

const AENEID_RPC_URL = process.env.AENEID_RPC_URL || "https://aeneid.storyrpc.io";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const TESTNET_PRIVATE_KEY = process.env.TESTNET_PRIVATE_KEY || "";
const STORYSCAN_API_KEY = process.env.STORYSCAN_API_KEY || "";

/** @type import("hardhat/config").HardhatUserConfig */
const config = {
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

module.exports = config;

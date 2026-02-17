// SovryExchange view-only ABI for reading on-chain state
export const exchangeReadAbi = [
  {
    inputs: [],
    name: "graduationThreshold",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "wrapperToken", type: "address" }],
    name: "getMarketCap",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "bondingCurveActive",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "bondingCurves",
    outputs: [
      { internalType: "uint128", name: "basePrice", type: "uint128" },
      { internalType: "uint128", name: "priceIncrement", type: "uint128" },
      { internalType: "uint128", name: "currentSupply", type: "uint128" },
      { internalType: "uint128", name: "reserveBalance", type: "uint128" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "launchedTokens",
    outputs: [
      { internalType: "address", name: "rtAddress", type: "address" },
      { internalType: "address", name: "wrapperAddress", type: "address" },
      { internalType: "address", name: "creator", type: "address" },
      { internalType: "address", name: "ipAsset", type: "address" },
      { internalType: "uint256", name: "launchTime", type: "uint256" },
      { internalType: "uint256", name: "totalLocked", type: "uint256" },
      { internalType: "bool", name: "graduated", type: "bool" },
      { internalType: "uint256", name: "totalRoyaltiesHarvested", type: "uint256" },
      { internalType: "address", name: "vaultAddress", type: "address" },
      { internalType: "uint256", name: "dexReserve", type: "uint256" },
      { internalType: "uint256", name: "initialCurveSupply", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "wrapperToken", type: "address" }],
    name: "wrapperToRt",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "rtToWrapper",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// SovryRouter write ABI for buy/sell transactions
export const routerWriteAbi = [
  {
    inputs: [
      { internalType: "address", name: "wrapperToken", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "maxEthCost", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "buyETH",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "wrapperToken", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "minEthProceeds", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "sell",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

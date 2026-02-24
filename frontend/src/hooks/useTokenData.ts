"use client";

import { useMemo } from "react";
import { formatEther, type Address } from "viem";
import { useReadContracts } from "wagmi";
import { SOVRY_EXCHANGE_ADDRESS } from "@/services/storyProtocolService";

const EXCHANGE_ADDRESS = (process.env.NEXT_PUBLIC_EXCHANGE_ADDRESS || SOVRY_EXCHANGE_ADDRESS) as Address | undefined;

const ERC20_READ_ABI = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "supply", type: "uint256" }],
  },
] as const;

const EXCHANGE_READ_ABI = [
  {
    type: "function",
    name: "bondingCurves",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "basePrice", type: "uint128" },
      { name: "priceIncrement", type: "uint128" },
      { name: "currentSupply", type: "uint128" },
      { name: "reserveBalance", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "getMarketCap",
    stateMutability: "view",
    inputs: [{ name: "wrapperToken", type: "address" }],
    outputs: [{ name: "marketCap", type: "uint256" }],
  },
  {
    type: "function",
    name: "bondingCurveActive",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "isActive", type: "bool" }],
  },
  {
    type: "function",
    name: "launchedTokens",
    stateMutability: "view",
    inputs: [{ name: "wrapperToken", type: "address" }],
    outputs: [
      { name: "rtAddress", type: "address" },
      { name: "wrapperAddress", type: "address" },
      { name: "creator", type: "address" },
      { name: "ipAsset", type: "address" },
      { name: "launchTime", type: "uint256" },
      { name: "totalLocked", type: "uint256" },
      { name: "graduated", type: "bool" },
      { name: "totalRoyaltiesHarvested", type: "uint256" },
      { name: "vaultAddress", type: "address" },
      { name: "dexReserve", type: "uint256" },
      { name: "initialCurveSupply", type: "uint256" },
    ],
  },
] as const;

export type TokenData = {
  reserveBalance: bigint;
  initialCurveSupply: bigint;
  currentSupply: bigint;
  alpha: bigint;
  beta: bigint;
  marketCap: bigint;
  isActive: boolean;
  totalSupply: bigint;
  rtAddress: string;
  totalLocked: bigint;
  reserveBalanceFormatted: string;
  marketCapFormatted: string;
  totalSupplyFormatted: string;
};

export function useTokenData(tokenAddress?: string | null) {
  const calls = useMemo(() => {
    if (!tokenAddress || !EXCHANGE_ADDRESS) return [];
    const addr = tokenAddress as Address;
    return [
      {
        address: EXCHANGE_ADDRESS,
        abi: EXCHANGE_READ_ABI,
        functionName: "bondingCurves" as const,
        args: [addr],
      },
      {
        address: EXCHANGE_ADDRESS,
        abi: EXCHANGE_READ_ABI,
        functionName: "getMarketCap" as const,
        args: [addr],
      },
      {
        address: EXCHANGE_ADDRESS,
        abi: EXCHANGE_READ_ABI,
        functionName: "bondingCurveActive" as const,
        args: [addr],
      },
      {
        address: EXCHANGE_ADDRESS,
        abi: EXCHANGE_READ_ABI,
        functionName: "launchedTokens" as const,
        args: [addr],
      },
      {
        address: addr,
        abi: ERC20_READ_ABI,
        functionName: "totalSupply" as const,
      },
    ];
  }, [tokenAddress]);

  const { data, isFetching, isError, refetch, error } = useReadContracts({
    contracts: calls,
    allowFailure: true,
    query: {
      enabled: calls.length === 5,
      staleTime: 15_000,
    },
  });

  const parsed: TokenData | null = useMemo(() => {
    if (!data || data.length !== 5) return null;
    const [curveRes, marketCapRes, activeRes, launchedRes, supplyRes] = data;

    if (
      curveRes?.result === undefined ||
      marketCapRes?.result === undefined ||
      activeRes?.result === undefined ||
      launchedRes?.result === undefined ||
      supplyRes?.result === undefined
    ) {
      return null;
    }

    const curve = curveRes.result as readonly unknown[] & {
      basePrice?: bigint;
      priceIncrement?: bigint;
      currentSupply?: bigint;
      reserveBalance?: bigint;
    };

    const launched = launchedRes.result as readonly unknown[] & {
      rtAddress?: string;
      totalLocked?: bigint;
      initialCurveSupply?: bigint;
    };

    const basePrice = BigInt((curve as any).basePrice ?? (Array.isArray(curve) ? (curve[0] as any) : 0n) ?? 0n);
    const priceIncrement = BigInt(
      (curve as any).priceIncrement ?? (Array.isArray(curve) ? (curve[1] as any) : 0n) ?? 0n
    );
    const currentSupply = BigInt((curve as any).currentSupply ?? (Array.isArray(curve) ? (curve[2] as any) : 0n) ?? 0n);
    const reserveBalance = BigInt((curve as any).reserveBalance ?? (Array.isArray(curve) ? (curve[3] as any) : 0n) ?? 0n);
    const rtAddress = String((launched as any).rtAddress ?? (Array.isArray(launched) ? (launched[0] as any) : ""));
    const totalLocked = BigInt((launched as any).totalLocked ?? (Array.isArray(launched) ? (launched[5] as any) : 0n) ?? 0n);
    const initialCurveSupply = BigInt(
      (launched as any).initialCurveSupply ?? (Array.isArray(launched) ? (launched[10] as any) : 0n) ?? 0n
    );

    const marketCap = BigInt((marketCapRes as any).result ?? 0n);
    const totalSupply = BigInt((supplyRes as any).result ?? 0n);
    const isActive = Boolean((activeRes as any).result);

    return {
      reserveBalance,
      initialCurveSupply,
      currentSupply,
      alpha: basePrice,
      beta: priceIncrement,
      marketCap,
      isActive,
      totalSupply,
      rtAddress,
      totalLocked,
      reserveBalanceFormatted: formatEther(reserveBalance),
      marketCapFormatted: formatEther(marketCap),
      totalSupplyFormatted: formatEther(totalSupply),
    };
  }, [data]);

  return {
    data: parsed,
    isLoading: isFetching,
    isError,
    error,
    refetch,
  };
}

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
      {
        components: [
          { name: "initialCurveSupply", type: "uint256" },
          { name: "currentSupply", type: "uint256" },
          { name: "reserveBalance", type: "uint256" },
          { name: "alpha", type: "uint256" },
          { name: "beta", type: "uint256" },
          { name: "graduationThreshold", type: "uint256" },
          { name: "graduationDelaySecs", type: "uint256" },
        ],
        name: "curve",
        type: "tuple",
      },
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
] as const;

export type TokenData = {
  reserveBalance: bigint;
  initialCurveSupply: bigint;
  currentSupply: bigint;
  marketCap: bigint;
  isActive: boolean;
  totalSupply: bigint;
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
      enabled: calls.length === 4,
      staleTime: 15_000,
    },
  });

  const parsed: TokenData | null = useMemo(() => {
    if (!data || data.length !== 4) return null;
    const [curveRes, marketCapRes, activeRes, supplyRes] = data;
    if (!curveRes?.result || marketCapRes?.result === undefined || activeRes?.result === undefined || supplyRes?.result === undefined) {
      return null;
    }

    const curve = curveRes.result as any;
    const reserveBalance = BigInt(curve.reserveBalance ?? 0n);
    const initialCurveSupply = BigInt(curve.initialCurveSupply ?? 0n);
    const currentSupply = BigInt(curve.currentSupply ?? 0n);
    const marketCap = BigInt((marketCapRes as any).result ?? 0n);
    const totalSupply = BigInt((supplyRes as any).result ?? 0n);
    const isActive = Boolean((activeRes as any).result);

    return {
      reserveBalance,
      initialCurveSupply,
      currentSupply,
      marketCap,
      isActive,
      totalSupply,
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

// Lightweight bonding curve helpers used by the SwapInterface UI.
// NOTE: These are deliberately conservative approximations so that
// on-chain trades should not revert due to slippage. For exact math,
// mirror the SovryLaunchpad contract implementation.

import { parseEther } from "viem";

/**
 * Very simple estimate for amount of tokens received when buying with IP.
 * Currently assumes ~1:1 IP:TOKEN around the current region of the curve.
 */
export function calculateBuyAmount(ipIn: bigint, _currentSupply: bigint): bigint {
  if (ipIn <= 0n) return 0n;
  return ipIn; // 1 IP -> 1 TOKEN approximation
}

/**
 * Very simple estimate for amount of IP received when selling tokens.
 * Currently assumes ~1:1 TOKEN:IP.
 */
export function calculateSellAmount(tokensIn: bigint, _currentSupply: bigint): bigint {
  if (tokensIn <= 0n) return 0n;
  return tokensIn; // 1 TOKEN -> 1 IP approximation
}

/**
 * Heuristic price impact estimate (0–100%).
 * We approximate impact as tradeSize / (supply + tradeSize).
 */
export function calculatePriceImpact(amountIn: bigint, currentSupply: bigint, _isBuy: boolean): number {
  if (amountIn <= 0n) return 0;

  // Convert to rough whole-token units to avoid BigInt overflow in Number()
  const ONE = parseEther("1");
  const tradeSize = Number(amountIn / ONE);
  const supplySize = Number((currentSupply > 0n ? currentSupply : ONE) / ONE);

  if (!isFinite(tradeSize) || !isFinite(supplySize) || supplySize <= 0) return 0;

  const ratio = tradeSize / (supplySize + tradeSize);
  const pct = ratio * 100;
  return Math.max(0, Math.min(100, pct));
}

export interface BondingCurveParams {
  basePrice: bigint;
  priceIncrement: bigint;
  currentSupply: bigint;
  initialCurveSupply: bigint;
}

export const WRAP_UNIT = 10n ** 6n;
const TOTAL_FEE_BPS = 100n; // 1%
const BPS_DENOMINATOR = 10_000n;

export function calculateBondingCurveBuyCost(params: BondingCurveParams, amount: bigint): bigint {
  if (amount <= 0n) return 0n;
  if (amount % WRAP_UNIT !== 0n) return 0n;
  if (params.currentSupply < amount) return 0n;
  const soldRaw = params.initialCurveSupply > params.currentSupply
    ? params.initialCurveSupply - params.currentSupply
    : 0n;
  const soldUnits = soldRaw / WRAP_UNIT;
  const amountUnits = amount / WRAP_UNIT;
  if (amountUnits === 0n) return 0n;
  const baseCost = params.basePrice * amountUnits;
  const term1 = params.priceIncrement * soldUnits * amountUnits;
  const term2 = (params.priceIncrement * amountUnits * amountUnits) / 2n;
  const incrementCost = term1 + term2;
  return baseCost + incrementCost;
}

export function calculateBondingCurveSellProceeds(params: BondingCurveParams, amount: bigint): bigint {
  if (amount <= 0n) return 0n;
  if (amount % WRAP_UNIT !== 0n) return 0n;
  const soldRaw = params.initialCurveSupply > params.currentSupply
    ? params.initialCurveSupply - params.currentSupply
    : 0n;
  if (soldRaw < amount) return 0n;
  const soldUnits = soldRaw / WRAP_UNIT;
  const amountUnits = amount / WRAP_UNIT;
  if (amountUnits === 0n) return 0n;
  const baseProceeds = params.basePrice * amountUnits;
  const term1 = params.priceIncrement * soldUnits * amountUnits;
  const term2 = (params.priceIncrement * amountUnits * amountUnits) / 2n;
  const incrementProceeds = term1 - term2;
  return baseProceeds + incrementProceeds;
}

export function estimateBuyAmountForIp(
  params: BondingCurveParams,
  ipInWei: bigint
): { amount: bigint; baseCost: bigint; totalCost: bigint } {
  if (ipInWei <= 0n) return { amount: 0n, baseCost: 0n, totalCost: 0n };
  let lo = 0n;
  let hi = params.currentSupply - (params.currentSupply % WRAP_UNIT);
  if (hi <= 0n) return { amount: 0n, baseCost: 0n, totalCost: 0n };
  let bestAmount = 0n;
  let bestBase = 0n;
  let bestTotal = 0n;
  while (lo <= hi) {
    let mid = (lo + hi) / 2n;
    mid -= mid % WRAP_UNIT;
    if (mid <= 0n) {
      lo = WRAP_UNIT;
      continue;
    }
    const baseCost = calculateBondingCurveBuyCost(params, mid);
    if (baseCost === 0n) {
      hi = mid - WRAP_UNIT;
      continue;
    }
    const fee = (baseCost * TOTAL_FEE_BPS) / BPS_DENOMINATOR;
    const totalCost = baseCost + fee;
    if (totalCost <= ipInWei) {
      bestAmount = mid;
      bestBase = baseCost;
      bestTotal = totalCost;
      lo = mid + WRAP_UNIT;
    } else {
      hi = mid - WRAP_UNIT;
    }
  }
  return { amount: bestAmount, baseCost: bestBase, totalCost: bestTotal };
}

export function calculateRealPriceImpact(
  paramsAmountOrIn: bigint | BondingCurveParams,
  currentSupplyOrAmount: bigint,
  isBuy: boolean
): number {
  if (typeof paramsAmountOrIn === "bigint") {
    return 0;
  }
  const params = paramsAmountOrIn as BondingCurveParams;
  const amount = currentSupplyOrAmount;
  if (amount <= 0n) return 0;
  const soldRaw = params.initialCurveSupply > params.currentSupply
    ? params.initialCurveSupply - params.currentSupply
    : 0n;
  const soldUnits = soldRaw / WRAP_UNIT;
  const amountUnits = amount / WRAP_UNIT;
  if (amountUnits === 0n) return 0;
  const p0 = params.basePrice + params.priceIncrement * soldUnits;
  if (p0 === 0n) return 0;
  let newUnits: bigint;
  if (isBuy) {
    newUnits = soldUnits + amountUnits;
  } else {
    newUnits = soldUnits > amountUnits ? soldUnits - amountUnits : 0n;
  }
  const p1 = params.basePrice + params.priceIncrement * newUnits;
  const diff = p1 > p0 ? p1 - p0 : p0 - p1;
  const impactBps = (diff * 10_000n) / p0;
  const impact = Number(impactBps) / 100;
  return impact;
}

/**
 * Gas estimate helper for UI. Returns a conservative fixed gas limit
 * which is then multiplied by a default gas price in the SwapInterface.
 */
export function estimateGas(_amountIn: bigint): bigint {
  // 300k gas as a conservative upper bound for buy/sell on the launchpad
  return 300_000n;
}

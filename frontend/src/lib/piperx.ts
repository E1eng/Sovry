export const PIPERX_BASE_URL = "https://piperx.xyz";

export function getPiperXPoolUrl(poolAddress: string): string {
  return `${PIPERX_BASE_URL}/pool/${poolAddress}`;
}

export function getPiperXTokenUrl(tokenAddress: string): string {
  return `${PIPERX_BASE_URL}/token/${tokenAddress}`;
}

export function getPiperXDexUrl(opts?: {
  poolAddress?: string | null | undefined;
  tokenAddress?: string | null | undefined;
}): string {
  if (opts?.poolAddress) return getPiperXPoolUrl(opts.poolAddress);
  if (opts?.tokenAddress) return getPiperXTokenUrl(opts.tokenAddress);
  return PIPERX_BASE_URL;
}

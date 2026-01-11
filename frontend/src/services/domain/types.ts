export interface PrimaryWalletLike {
  address: string | Promise<string>;
  getWalletClient?: () => Promise<unknown>;
}

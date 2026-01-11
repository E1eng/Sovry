export interface PrimaryWalletLike {
  address: string | Promise<string>;
  getWalletClient?: () => Promise<WalletClientLike>;
}

export type TransactionHash = `0x${string}`;

export interface WalletClientLike {
  transport?: unknown;
  sendTransaction: (args: unknown) => Promise<TransactionHash>;
}

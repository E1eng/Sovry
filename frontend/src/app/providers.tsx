"use client";

import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { WagmiProvider, createConfig, http } from "wagmi";
import { Toaster as HotToaster } from "react-hot-toast";
import { logger } from "@/lib/logger";
import { STORY_RPC_URL, STORYSCAN_BASE_URL } from "@/lib/env";

const queryClient = new QueryClient();

const storyMainnet = {
  id: 1514,
  name: "Story Mainnet",
  nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
  rpcUrls: {
    default: { http: [STORY_RPC_URL] },
    public: { http: [STORY_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "StoryScan", url: STORYSCAN_BASE_URL },
  },
} as const;

const wagmiConfig = createConfig({
  chains: [storyMainnet],
  transports: {
    [storyMainnet.id]: http(STORY_RPC_URL),
  },
});

const evmNetworks = [
  {
    blockExplorerUrls: [STORYSCAN_BASE_URL],
    chainId: 1514,
    chainName: "Story Mainnet",
    iconUrls: ["https://app.dynamic.xyz/assets/networks/eth.svg"],
    name: "Story Mainnet",
    nativeCurrency: {
      decimals: 18,
      name: "IP",
      symbol: "IP",
      iconUrl: "https://app.dynamic.xyz/assets/networks/eth.svg",
    },
    networkId: 1514,
    rpcUrls: [STORY_RPC_URL],
    vanityName: "Story Mainnet",
  },
];

export function Providers({ children }: { children: ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || "",
        initialAuthenticationMode: "connect-only",
        enableVisitTrackingOnConnectOnly: false,
        walletConnectors: [EthereumWalletConnectors],
        overrides: {
          evmNetworks,
        },
        events: {
          onEmbeddedWalletCreated: (args) => {
            logger.log("Embedded wallet created:", args);
          },
        },
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          {children}
          <HotToaster
            position="top-right"
            toastOptions={{
              style: {
                background: "#1a1a1a",
                border: "1px solid #333",
                color: "#fff",
              },
              duration: 2000,
            }}
          />
        </QueryClientProvider>
      </WagmiProvider>
    </DynamicContextProvider>
  );
}

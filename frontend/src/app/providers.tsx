"use client";

import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { Toaster } from "sonner";
import { Toaster as HotToaster } from "react-hot-toast";

const queryClient = new QueryClient();

const evmNetworks = [
  {
    blockExplorerUrls: ["https://storyscan.xyz/"],
    chainId: 1315, // Correct Story Aeneid Testnet chain ID
    chainName: "Story Aeneid Testnet",
    iconUrls: ["https://app.dynamic.xyz/assets/networks/eth.svg"],
    name: "Story Aeneid Testnet",
    nativeCurrency: {
      decimals: 18,
      name: "IP",
      symbol: "IP",
      iconUrl: "https://app.dynamic.xyz/assets/networks/eth.svg",
    },
    networkId: 1315,
    rpcUrls: [process.env.NEXT_PUBLIC_STORY_RPC_URL || "https://aeneid.storyrpc.io"],
    vanityName: "Story Aeneid Testnet",
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
            console.log('Embedded wallet created:', args);
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#1a1a1a",
              border: "1px solid #333",
              color: "#fff",
            },
          }}
        />
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
    </DynamicContextProvider>
  );
}

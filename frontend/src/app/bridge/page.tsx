 "use client";

import { useEffect, useRef } from "react";

const DEBRIDGE_WIDGET_CONFIG = {
  element: "debridgeWidget",
  title: "",
  description: "",
  width: "100%",
  height: "600",
  isAutoHeight: true,
  r: null,
  affiliateFeePercent: "0.3",
  affiliateFeeRecipient: "0x8c317fb91a73e2c8d4883dded3981982f046f733",
  supportedChains: {
    inputChains: {
      "1": "all",
      "10": "all",
      "56": "all",
      "100": "all",
      "137": "all",
      "143": "all",
      "146": "all",
      "747": "all",
      "999": "all",
      "1329": "all",
      "1514": "all",
      "1776": "all",
      "2741": "all",
      "5000": "all",
      "8453": "all",
      "9745": "all",
      "32769": "all",
      "42161": "all",
      "43114": "all",
      "50104": "all",
      "59144": "all",
      "60808": "all",
      "80094": "all",
      "999999": "all",
      "7565164": "all",
      "245022934": "all",
      "728126428": "all",
    },
    outputChains: {
      "1": "all",
      "10": "all",
      "56": "all",
      "100": "all",
      "137": "all",
      "143": "all",
      "146": "all",
      "747": "all",
      "999": "all",
      "1329": "all",
      "1514": "all",
      "1776": "all",
      "2741": "all",
      "5000": "all",
      "8453": "all",
      "9745": "all",
      "32769": "all",
      "42161": "all",
      "43114": "all",
      "50104": "all",
      "59144": "all",
      "60808": "all",
      "80094": "all",
      "999999": "all",
      "7565164": "all",
      "245022934": "all",
      "728126428": "all",
    },
  },
  inputChain: 8453,
  outputChain: 1514,
  inputCurrency: "",
  outputCurrency: "",
  address: "",
  showSwapTransfer: true,
  amount: "",
  outputAmount: "",
  isAmountFromNotModifiable: false,
  isAmountToNotModifiable: false,
  lang: "en",
  mode: "DESWAP",
  isEnableCalldata: false,
  styles: {},
  theme: "dark",
  isHideLogo: false,
  logo: "",
  disabledWallets: [],
  disabledElements: ["Points"],
} as const;

export default function BridgePage() {
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Avoid running twice in React StrictMode for the same mount
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const container = widgetContainerRef.current;
    if (!container) return;

    const scriptSrc = "https://app.debridge.com/assets/scripts/widget.js";
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptSrc}"]`);

    const initWidget = async () => {
      const anyWindow = window as any;
      if (!anyWindow.deBridge || typeof anyWindow.deBridge.widget !== "function") {
        return;
      }

      try {
        // Clear any previous content before re-embedding
        container.innerHTML = "";

        await anyWindow.deBridge.widget({
          ...DEBRIDGE_WIDGET_CONFIG,
          element: container.id || DEBRIDGE_WIDGET_CONFIG.element,
        });
      } catch (error) {
        console.error("Failed to initialize deBridge widget", error);
      }
    };

    if (!existingScript) {
      const script = document.createElement("script");
      script.src = scriptSrc;
      script.async = true;
      script.onload = () => {
        initWidget();
      };
      document.body.appendChild(script);
    } else {
      initWidget();
    }
  }, []);

  return (
    <div className="w-full flex justify-center px-3 sm:px-4 pt-4 pb-6 sm:pt-6 sm:pb-8">
      <div
        id={DEBRIDGE_WIDGET_CONFIG.element}
        ref={widgetContainerRef}
        className="w-full max-w-md sm:max-w-lg pointer-events-none"
      />
    </div>
  );
}
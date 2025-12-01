"use client";

import { useState, useEffect } from "react";
import { getRoyaltyVaultBalance } from "@/services/launchpadService";

export function useRoyaltyVaultBalance(vaultAddress: string | undefined) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vaultAddress || vaultAddress === "0x0000000000000000000000000000000000000000") {
      setBalance(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    const POLL_INTERVAL = 15000; // 15 seconds

    const fetchBalance = async () => {
      try {
        setError(null);
        const vaultBalance = await getRoyaltyVaultBalance(vaultAddress);
        
        if (isMounted) {
          setBalance(vaultBalance);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to fetch vault balance");
          setLoading(false);
        }
      }
    };

    // Initial fetch
    fetchBalance();

    // Set up polling
    const intervalId = setInterval(fetchBalance, POLL_INTERVAL);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [vaultAddress]);

  return { balance, loading, error };
}


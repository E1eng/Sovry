"use client";

import { useState, useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ArrowDownUp, Settings, TrendingUp, CheckCircle, AlertCircle } from "lucide-react";
import { createPublicClient, http, Address } from "viem";
import { launchpadService, type LaunchInfo } from "@/services/launchpadService";

const GOLDSKY_API_URL = process.env.NEXT_PUBLIC_GOLDSKY_API_URL;

interface SwapToken {
  id: string;
  symbol: string;
  name: string;
}

interface SwapPool {
  id: string;
  token0: SwapToken;
  token1: SwapToken;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
}

interface SwapInterfaceProps {
  defaultFromToken?: string;
  defaultToToken?: string;
}

const TOKEN_MAPPING: Record<string, { symbol: string; name: string }> = {
  "0x1514000000000000000000000000000000000000": {
    symbol: "WIP",
    name: "Wrapped IP"
  },
  "0xb6b837972cfb487451a71279fa78c327bb27646e": {
    symbol: "RT",
    name: "Royalty Token"
  },
  "native": {
    symbol: "IP",
    name: "Native IP Token"
  }
};

export default function SwapInterface({
  defaultFromToken,
  defaultToToken,
}: SwapInterfaceProps) {
  const { primaryWallet } = useDynamicContext();
  const walletAddress = primaryWallet?.address as string | undefined;

  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fromToken, setFromToken] = useState("");
  const [toToken, setToToken] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [deadline, setDeadline] = useState("20");
  const [showSettings, setShowSettings] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationSuccess, setSimulationSuccess] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  
  const [pools, setPools] = useState<SwapPool[]>([]);
  const [availableTokens, setAvailableTokens] = useState<SwapToken[]>([]);
  const [poolsLoading, setPoolsLoading] = useState(true);
  const [poolsError, setPoolsError] = useState<string | null>(null);
  const [selectedPool, setSelectedPool] = useState<SwapPool | null>(null);
  const [launchInfo, setLaunchInfo] = useState<LaunchInfo | null>(null);
  const [bondingProgress, setBondingProgress] = useState(0);
  const [bondingTokenAddress, setBondingTokenAddress] = useState<string | null>(null);
  const [launchpadMode, setLaunchpadMode] = useState<"none" | "bonding" | "dex">("none");
  const [launchpadError, setLaunchpadError] = useState<string | null>(null);

  // Fetch swap pools directly from blockchain
  const fetchSwapPoolsFromBlockchain = async () => {
    try {
      console.log('🔗 Fetching swap pools directly from Story Protocol blockchain...');
      
      // Create public client for Story Protocol
      const publicClient = createPublicClient({
        chain: {
          id: 1315,
          name: 'Story Aeneid Testnet',
          nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
          rpcUrls: {
            default: { http: ['https://aeneid.storyrpc.io'] },
            public: { http: ['https://aeneid.storyrpc.io'] },
          },
        },
        transport: http('https://aeneid.storyrpc.io'),
      });

      // Sovry Factory contract address
      const FACTORY_ADDRESS = '0xAc903015B6828A5290DF0e42504423EBB295c8a3';
      
      // Factory ABI to get all pools
      const factoryABI = [
        {
          inputs: [],
          name: 'getAllPools',
          outputs: [{ type: 'address[]', name: 'pools' }],
          stateMutability: 'view',
          type: 'function',
        },
      ] as const;

      try {
        // Get all pools from factory contract
        const poolAddresses = await publicClient.readContract({
          address: FACTORY_ADDRESS as Address,
          abi: factoryABI,
          functionName: 'getAllPools',
        });

        console.log(`📋 Found ${poolAddresses.length} swap pools on blockchain`);

        // Map to SwapPool format
        const swapPools: SwapPool[] = poolAddresses.map((address, index) => ({
          id: address,
          token0: {
            id: '0x1514000000000000000000000000000000000000',
            symbol: 'WIP',
            name: 'Wrapped IP'
          },
          token1: {
            id: '0xb6b837972cfb487451a71279fa78c327bb27646e',
            symbol: 'RT',
            name: 'Royalty Token'
          },
          reserve0: '1000',
          reserve1: '2000',
          totalSupply: '3000'
        }));

        setPools(swapPools);

        const tokens: SwapToken[] = [
          { id: '0x1514000000000000000000000000000000000000', symbol: 'WIP', name: 'Wrapped IP' },
          { id: '0xb6b837972cfb487451a71279fa78c327bb27646e', symbol: 'RT', name: 'Royalty Token' },
          { id: 'native', symbol: 'IP', name: 'Native IP Token' }
        ];
        setAvailableTokens(tokens);
        setPoolsError(null);

        console.log(`✅ Successfully fetched ${swapPools.length} swap pools from blockchain`);
      } catch (contractError) {
        console.log('⚠️ Factory contract not found - showing empty pools');
        setPools([]);
        setAvailableTokens([]);
      }
    } catch (error) {
      console.error('❌ Error fetching swap pools from blockchain:', error);
      setPoolsError('Failed to fetch pools from blockchain');
    } finally {
      setPoolsLoading(false);
    }
  };

  const fetchPools = async () => {
    if (!GOLDSKY_API_URL) {
      console.log("⚠️ Goldsky API URL not configured - fetching from blockchain");
      // Fetch pools directly from blockchain
      await fetchSwapPoolsFromBlockchain();
      return;
    }

    try {
      setPoolsLoading(true);
      setPoolsError(null);

      const query = `
        query GetSwapPools {
          pools(first: 100) {
            id
            token0 {
              id
            }
            token1 {
              id
            }
            reserve0
            reserve1
            totalSupply
          }
        }
      `;

      const response = await fetch(GOLDSKY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      console.log("Swap pools response:", data);

      if (data.errors && data.errors.length > 0) {
        throw new Error(data.errors[0]?.message || "GraphQL error");
      }

      if (data.data && data.data.pools) {
        const mappedPools = data.data.pools.map((pool: any) => {
          const token0Address = pool.token0?.id?.toLowerCase();
          const token1Address = pool.token1?.id?.toLowerCase();
          
          const token0Info = TOKEN_MAPPING[token0Address] || {
            symbol: "UNKNOWN",
            name: "Unknown Token"
          };
          
          const token1Info = TOKEN_MAPPING[token1Address] || {
            symbol: "UNKNOWN", 
            name: "Unknown Token"
          };
          
          return {
            ...pool,
            token0: {
              id: pool.token0?.id || "",
              symbol: token0Info.symbol,
              name: token0Info.name
            },
            token1: {
              id: pool.token1?.id || "",
              symbol: token1Info.symbol,
              name: token1Info.name
            }
          };
        });

        console.log("Mapped swap pools:", mappedPools);
        setPools(mappedPools);

        const tokens: SwapToken[] = [];
        const tokenSet = new Set<string>();

        mappedPools.forEach((pool: SwapPool) => {
          if (!tokenSet.has(pool.token0.id)) {
            tokens.push(pool.token0);
            tokenSet.add(pool.token0.id);
          }
          if (!tokenSet.has(pool.token1.id)) {
            tokens.push(pool.token1);
            tokenSet.add(pool.token1.id);
          }
        });

        // Add native IP token for auto-wrapping
        const nativeToken: SwapToken = {
          id: "native",
          symbol: "IP",
          name: "Native IP Token"
        };
        tokens.unshift(nativeToken); // Add at beginning
        
        setAvailableTokens(tokens);
        console.log("Available tokens for swap:", tokens);
      } else {
        setPools([]);
        setAvailableTokens([]);
      }
    } catch (err) {
      console.log("❌ Error fetching swap pools - falling back to blockchain:", err);
      // Fall back to direct blockchain fetch
      await fetchSwapPoolsFromBlockchain();
    } finally {
      setPoolsLoading(false);
    }
  };

  useEffect(() => {
    console.log("SwapInterface mounted - fetching real pools from Goldsky");
    fetchPools();
  }, []);

  useEffect(() => {
    if (defaultFromToken || defaultToToken) {
      setFromToken(defaultFromToken || "");
      setToToken(defaultToToken || "");
      setFromAmount("");
      setToAmount("");
    }
  }, [defaultFromToken, defaultToToken]);

  useEffect(() => {
    if (fromToken && toToken && pools.length > 0) {
      // Handle native IP auto-wrapping to WIP
      const effectiveFromToken = fromToken === "IP" ? "WIP" : fromToken;
      const effectiveToToken = toToken === "IP" ? "WIP" : toToken;
      
      const pool = pools.find(p => 
        (p.token0.symbol === effectiveFromToken && p.token1.symbol === effectiveToToken) ||
        (p.token1.symbol === effectiveFromToken && p.token0.symbol === effectiveToToken)
      );
      setSelectedPool(pool || null);
      console.log("Selected pool for swap:", pool, { fromToken, toToken, effectiveFromToken, effectiveToToken });
    } else {
      setSelectedPool(null);
    }
  }, [fromToken, toToken, pools]);

  useEffect(() => {
    const checkLaunchpadStatus = async () => {
      setLaunchpadError(null);
      setLaunchInfo(null);
      setBondingTokenAddress(null);
      setBondingProgress(0);

      if (!fromToken || !toToken || availableTokens.length === 0) {
        setLaunchpadMode("none");
        return;
      }

      const fromMeta = availableTokens.find((t) => t.symbol === fromToken);
      const toMeta = availableTokens.find((t) => t.symbol === toToken);

      if (!fromMeta || !toMeta) {
        setLaunchpadMode("none");
        return;
      }

      const isFromIP = fromMeta.symbol === "IP";
      const isToIP = toMeta.symbol === "IP";

      if (isFromIP === isToIP) {
        setLaunchpadMode("dex");
        return;
      }

      const tokenMeta = isFromIP ? toMeta : fromMeta;
      const tokenAddress = tokenMeta.id;

      if (!tokenAddress || tokenAddress === "native") {
        setLaunchpadMode("dex");
        return;
      }

      try {
        const info = await launchpadService.getLaunchInfo(tokenAddress);
        if (!info) {
          setLaunchpadMode("dex");
          return;
        }

        setLaunchInfo(info);
        setBondingTokenAddress(tokenAddress);
        const progress = launchpadService.getBondingProgress(info);
        setBondingProgress(progress);
        setLaunchpadMode(info.graduated ? "dex" : "bonding");
      } catch (error) {
        console.error("Error checking launchpad status:", error);
        setLaunchpadError("Failed to load Launchpad status");
        setLaunchpadMode("dex");
      }
    };

    checkLaunchpadStatus();
  }, [fromToken, toToken, availableTokens]);

  useEffect(() => {
    if (!fromAmount || !fromToken || !toToken) {
      setSimulationSuccess(false);
      setToAmount("");
      return;
    }

    if (launchpadMode === "bonding" && bondingTokenAddress) {
      setIsSimulating(true);
      setSimulationSuccess(false);

      const timer = setTimeout(async () => {
        setIsSimulating(false);

        try {
          const inputValue = parseFloat(fromAmount) || 0;
          if (inputValue <= 0) {
            setToAmount("");
            setSimulationSuccess(false);
            return;
          }

          if (fromToken === "IP" && toToken !== "IP") {
            const estimated = await launchpadService.getEstimatedTokensForIP(
              bondingTokenAddress,
              fromAmount
            );
            setToAmount(parseFloat(estimated).toFixed(6));
            setSimulationSuccess(true);
          } else if (toToken === "IP" && fromToken !== "IP") {
            const estimated = await launchpadService.estimateIPForTokens(
              bondingTokenAddress,
              fromAmount
            );
            setToAmount(parseFloat(estimated).toFixed(6));
            setSimulationSuccess(true);
          } else {
            setToAmount("");
            setSimulationSuccess(false);
          }
        } catch (error) {
          console.error("Launchpad swap calculation error:", error);
          setToAmount("");
          setSimulationSuccess(false);
        }
      }, 800);

      return () => clearTimeout(timer);
    }

    if (fromAmount && fromToken && toToken && selectedPool) {
      setIsSimulating(true);
      setSimulationSuccess(false);
      
      const timer = setTimeout(() => {
        setIsSimulating(false);
        
        try {
          const inputValue = parseFloat(fromAmount) || 0;
          if (inputValue <= 0) {
            setToAmount("");
            setSimulationSuccess(false);
            return;
          }

          const effectiveFromToken = fromToken === "IP" ? "WIP" : fromToken;
          const isToken0Input = selectedPool.token0.symbol === effectiveFromToken;
          const reserveIn = parseFloat(isToken0Input ? selectedPool.reserve0 : selectedPool.reserve1);
          const reserveOut = parseFloat(isToken0Input ? selectedPool.reserve1 : selectedPool.reserve0);
          
          if (reserveIn <= 0 || reserveOut <= 0) {
            setToAmount("");
            setSimulationSuccess(false);
            return;
          }

          const amountInWithFee = inputValue * 0.997;
          const amountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
          
          setToAmount(amountOut.toFixed(6));
          setSimulationSuccess(true);
        } catch (error) {
          console.error("Swap calculation error:", error);
          setToAmount("");
          setSimulationSuccess(false);
        }
      }, 800);
      
      return () => clearTimeout(timer);
    } else {
      setSimulationSuccess(false);
      setToAmount("");
    }
  }, [fromAmount, fromToken, toToken, selectedPool, launchpadMode, bondingTokenAddress]);

  const bondingModeActive = launchpadMode === "bonding" && !!bondingTokenAddress;
  const requiresDexPool = !bondingModeActive;

  const handleSwap = async () => {
    if (!simulationSuccess || !fromAmount || !toToken) return;

    setIsSwapping(true);
    
    try {
      if (launchpadMode === "bonding" && bondingTokenAddress) {
        if (!primaryWallet || !walletAddress) {
          throw new Error("Connect your wallet to trade on the bonding curve");
        }

        const slippagePct = parseFloat(slippage || "0");

        if (fromToken === "IP" && toToken !== "IP") {
          const estOut = parseFloat(toAmount || "0");
          const minOut =
            estOut > 0 && slippagePct >= 0
              ? (estOut * (1 - slippagePct / 100)).toString()
              : "0";

          const result = await launchpadService.buy(
            bondingTokenAddress,
            fromAmount,
            minOut,
            primaryWallet
          );
          if (!result.success) {
            throw new Error(result.error || "Launchpad buy failed");
          }
        } else if (toToken === "IP" && fromToken !== "IP") {
          const estIpOut = parseFloat(toAmount || "0");
          const minIpOut =
            estIpOut > 0 && slippagePct >= 0
              ? (estIpOut * (1 - slippagePct / 100)).toString()
              : "0";

          const result = await launchpadService.sell(
            bondingTokenAddress,
            fromAmount,
            minIpOut,
            primaryWallet
          );
          if (!result.success) {
            throw new Error(result.error || "Launchpad sell failed");
          }
        } else {
          throw new Error("Bonding curve swaps are only supported between IP and a launch token");
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      setFromAmount("");
      setToAmount("");
      setSimulationSuccess(false);
      
      alert("Swap successful!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Swap failed. Please try again.";
      alert(message);
    } finally {
      setIsSwapping(false);
    }
  };

  const handleReverseTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {poolsLoading && (
        <Card className="w-full max-w-2xl mx-auto">
          <CardContent className="py-12">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin mr-3" />
              <span className="text-lg">Loading available pools...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {poolsError && (
        <Card className="w-full max-w-2xl mx-auto">
          <CardContent className="py-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{poolsError}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {!poolsLoading && !poolsError && (
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-bold">Swap Tokens</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </div>
            {launchpadMode === "bonding" && launchInfo && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-blue-200">
                  <span className="font-medium">Bonding Curve Phase (SovryLaunchpad)</span>
                  <span>
                    {(
                      Number(launchInfo.totalRaised) / 1e18
                    ).toFixed(2)} IP / 100 IP
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-blue-500/20 overflow-hidden">
                  <div
                    className="h-2 bg-blue-400"
                    style={{ width: `${bondingProgress}%` }}
                  />
                </div>
              </div>
            )}
            {launchpadMode === "dex" && launchInfo?.graduated && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 text-xs text-emerald-200">
                <CheckCircle className="h-3 w-3" />
                Graduated to DEX (Sovry Router)
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {pools.length === 0 && requiresDexPool && (
              <Alert>
                <TrendingUp className="h-4 w-4" />
                <AlertDescription>
                  No liquidity pools available for swapping. Create pools first in the Liquidity tab.
                </AlertDescription>
              </Alert>
            )}

            {selectedPool && (
              <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg">
                <p className="text-sm text-foreground font-medium">
                  Pool: {selectedPool.token0.symbol} / {selectedPool.token1.symbol}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Reserves: {parseFloat(selectedPool.reserve0).toFixed(2)} {selectedPool.token0.symbol} • {parseFloat(selectedPool.reserve1).toFixed(2)} {selectedPool.token1.symbol}
                </p>
                {(fromToken === "IP" || toToken === "IP") && (
                  <p className="text-xs text-primary mt-1">
                    ⚡ Native IP will be auto-wrapped to WIP for this swap
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">From</label>
              <div className="flex gap-2">
                <Select 
                  value={fromToken} 
                  onValueChange={setFromToken}
                  disabled={requiresDexPool && pools.length === 0}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder={pools.length === 0 ? "No pools available" : "Select token"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTokens.map((token) => (
                      <SelectItem key={token.id} value={token.symbol}>
                        <div className="flex items-center gap-2">
                          <span>{token.symbol}</span>
                          <span className="text-xs text-gray-500">{token.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="0.0"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  className="flex-1"
                  disabled={requiresDexPool && pools.length === 0}
                />
              </div>
              {fromToken && availableTokens.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {availableTokens.find(t => t.symbol === fromToken)?.name}
                </p>
              )}
            </div>

            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReverseTokens}
                className="rounded-full"
                disabled={!fromToken || !toToken}
              >
                <ArrowDownUp className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">To</label>
              <div className="flex gap-2">
                <Select 
                  value={toToken} 
                  onValueChange={setToToken}
                  disabled={requiresDexPool && pools.length === 0}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder={pools.length === 0 ? "No pools available" : "Select token"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTokens
                      .filter(token => token.symbol !== fromToken)
                      .map((token) => (
                        <SelectItem key={token.id} value={token.symbol}>
                          <div className="flex items-center gap-2">
                            <span>{token.symbol}</span>
                            <span className="text-xs text-gray-500">{token.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="0.0"
                  value={toAmount}
                  readOnly
                  className="flex-1 bg-muted/20"
                  disabled={requiresDexPool && pools.length === 0}
                />
              </div>
              {toToken && availableTokens.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {availableTokens.find(t => t.symbol === toToken)?.name}
                </p>
              )}
            </div>

            {showSettings && (
              <div className="border border-border/50 rounded-lg p-4 space-y-3 bg-muted/10">
                <h3 className="font-medium text-sm text-foreground">Transaction Settings</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Slippage (%)</label>
                    <Input
                      type="number"
                      value={slippage}
                      onChange={(e) => setSlippage(e.target.value)}
                      className="h-8"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Deadline (min)</label>
                    <Input
                      type="number"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      className="h-8"
                    />
                  </div>
                </div>
              </div>
            )}

            {fromToken && toToken && !selectedPool && requiresDexPool && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No liquidity pool available for {fromToken} and {toToken} pair.
                </AlertDescription>
              </Alert>
            )}

            {fromAmount && toToken && (selectedPool || bondingModeActive) && (
              <div className="space-y-2">
                {isSimulating && (
                  <Alert>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertDescription>
                      Calculating swap output...
                    </AlertDescription>
                  </Alert>
                )}
                
                {simulationSuccess && (
                  <Alert className="border-emerald-500/30 bg-emerald-500/10">
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                    <AlertDescription className="text-emerald-300">
                      Swap calculation complete! Ready to execute.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <Button
              onClick={handleSwap}
              disabled={
                !simulationSuccess ||
                isSwapping ||
                !fromAmount ||
                !toToken ||
                (requiresDexPool && (pools.length === 0 || !selectedPool))
              }
              className="w-full py-3 text-base font-medium"
              size="lg"
            >
              {pools.length === 0 ? (
                "No pools available - Create pools first"
              ) : isSwapping ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Swapping...
                </>
              ) : !fromAmount || !toToken ? (
                "Select tokens and enter amount"
              ) : !selectedPool ? (
                "No pool available for this pair"
              ) : isSimulating ? (
                "Calculating..."
              ) : (
                launchpadMode === "bonding" && bondingTokenAddress ? (
                  fromToken === "IP" && toToken !== "IP" ? (
                    "Buy " + (toAmount || "0") + " " + toToken + " with " + (fromAmount || "0") + " IP"
                  ) : toToken === "IP" && fromToken !== "IP" ? (
                    "Sell " + (fromAmount || "0") + " " + fromToken + " for IP"
                  ) : (
                    "Swap " + (fromAmount || "0") + " " + fromToken + " for " + (toAmount || "0") + " " + toToken
                  )
                ) : (
                  fromToken === "IP" || toToken === "IP"
                    ? "Swap " + (fromAmount || "0") + " " + fromToken + " for " + (toAmount || "0") + " " + toToken + " (auto-wrap)"
                    : "Swap " + (fromAmount || "0") + " " + fromToken + " for " + (toAmount || "0") + " " + toToken
                )
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

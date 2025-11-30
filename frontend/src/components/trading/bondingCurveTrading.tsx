"use client";

import { useState, useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, TrendingUp, TrendingDown, AlertCircle, CheckCircle } from "lucide-react";
import { formatEther, parseEther } from "viem";
import { launchpadService, type LaunchInfo } from "@/services/launchpadService";
import { toast } from "sonner";

interface BondingCurveTradingProps {
  tokenAddress: string;
  launchInfo: LaunchInfo | null;
  bondingProgress: number;
  onTradeComplete?: () => void;
}

export default function BondingCurveTrading({
  tokenAddress,
  launchInfo,
  bondingProgress,
  onTradeComplete,
}: BondingCurveTradingProps) {
  const { primaryWallet } = useDynamicContext();
  const walletAddress = primaryWallet?.address;

  // Buy state
  const [buyAmount, setBuyAmount] = useState("");
  const [estimatedTokens, setEstimatedTokens] = useState<string | null>(null);
  const [buyPrice, setBuyPrice] = useState<string | null>(null);
  const [buyPriceImpact, setBuyPriceImpact] = useState<number | null>(null);
  const [buying, setBuying] = useState(false);

  // Sell state
  const [sellAmount, setSellAmount] = useState("");
  const [estimatedIP, setEstimatedIP] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState<string | null>(null);
  const [sellPriceImpact, setSellPriceImpact] = useState<number | null>(null);
  const [selling, setSelling] = useState(false);

  // Slippage
  const [slippage, setSlippage] = useState(0.5); // Default 0.5%

  // Current price
  const [currentPrice, setCurrentPrice] = useState<string | null>(null);

  // Calculate buy estimates
  useEffect(() => {
    const calculateBuyEstimate = async () => {
      if (!buyAmount || parseFloat(buyAmount) <= 0 || !tokenAddress) {
        setEstimatedTokens(null);
        setBuyPrice(null);
        setBuyPriceImpact(null);
        return;
      }

      try {
        const estimated = await launchpadService.getEstimatedTokensForIP(tokenAddress, buyAmount);
        setEstimatedTokens(estimated);

        // Calculate price (IP per token)
        const ipAmount = parseFloat(buyAmount);
        const tokenAmount = parseFloat(estimated);
        if (tokenAmount > 0) {
          const price = ipAmount / tokenAmount;
          setBuyPrice(price.toFixed(6));

          // Calculate price impact (simplified - compare to current price)
          if (currentPrice) {
            const current = parseFloat(currentPrice);
            const impact = ((price - current) / current) * 100;
            setBuyPriceImpact(impact);
          }
        }
      } catch (error) {
        console.error("Error calculating buy estimate:", error);
        setEstimatedTokens(null);
      }
    };

    calculateBuyEstimate();
  }, [buyAmount, tokenAddress, currentPrice]);

  // Calculate sell estimates
  useEffect(() => {
    const calculateSellEstimate = async () => {
      if (!sellAmount || parseFloat(sellAmount) <= 0 || !tokenAddress) {
        setEstimatedIP(null);
        setSellPrice(null);
        setSellPriceImpact(null);
        return;
      }

      try {
        const estimated = await launchpadService.estimateIPForTokens(tokenAddress, sellAmount);
        setEstimatedIP(estimated);

        // Calculate price (IP per token)
        const tokenAmount = parseFloat(sellAmount);
        const ipAmount = parseFloat(estimated);
        if (tokenAmount > 0) {
          const price = ipAmount / tokenAmount;
          setSellPrice(price.toFixed(6));

          // Calculate price impact
          if (currentPrice) {
            const current = parseFloat(currentPrice);
            const impact = ((current - price) / current) * 100;
            setSellPriceImpact(impact);
          }
        }
      } catch (error) {
        console.error("Error calculating sell estimate:", error);
        setEstimatedIP(null);
      }
    };

    calculateSellEstimate();
  }, [sellAmount, tokenAddress, currentPrice]);

  // Fetch current price
  useEffect(() => {
    const fetchCurrentPrice = async () => {
      if (!tokenAddress || !launchInfo) return;

      try {
        // Use a small amount to estimate current price
        const smallAmount = "0.001";
        const tokens = await launchpadService.getEstimatedTokensForIP(tokenAddress, smallAmount);
        const tokenAmount = parseFloat(tokens);
        if (tokenAmount > 0) {
          const price = parseFloat(smallAmount) / tokenAmount;
          setCurrentPrice(price.toFixed(6));
        }
      } catch (error) {
        console.error("Error fetching current price:", error);
      }
    };

    fetchCurrentPrice();
    const interval = setInterval(fetchCurrentPrice, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [tokenAddress, launchInfo]);

  const handleBuy = async () => {
    if (!primaryWallet || !buyAmount || !estimatedTokens) return;

    try {
      setBuying(true);

      // Calculate minimum tokens out with slippage
      const tokensOut = parseFloat(estimatedTokens);
      const minTokensOut = tokensOut * (1 - slippage / 100);

      const result = await launchpadService.buy(
        tokenAddress,
        buyAmount,
        minTokensOut.toFixed(18),
        primaryWallet
      );

      if (result.success) {
        toast.success("Purchase successful!", {
          description: `Transaction: ${result.txHash?.slice(0, 10)}...`,
        });
        setBuyAmount("");
        setEstimatedTokens(null);
        onTradeComplete?.();
      } else {
        toast.error("Purchase failed", {
          description: result.error || "Unknown error",
        });
      }
    } catch (error) {
      toast.error("Purchase failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBuying(false);
    }
  };

  const handleSell = async () => {
    if (!primaryWallet || !sellAmount || !estimatedIP) return;

    try {
      setSelling(true);

      // Calculate minimum IP out with slippage
      const ipOut = parseFloat(estimatedIP);
      const minIpOut = ipOut * (1 - slippage / 100);

      const result = await launchpadService.sell(
        tokenAddress,
        sellAmount,
        minIpOut.toFixed(18),
        primaryWallet
      );

      if (result.success) {
        toast.success("Sale successful!", {
          description: `Transaction: ${result.sellTxHash?.slice(0, 10)}...`,
        });
        setSellAmount("");
        setEstimatedIP(null);
        onTradeComplete?.();
      } else {
        toast.error("Sale failed", {
          description: result.error || "Unknown error",
        });
      }
    } catch (error) {
      toast.error("Sale failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSelling(false);
    }
  };

  const isGraduated = launchInfo?.graduated || false;

  if (isGraduated) {
    return (
      <Card className="bg-card/80 border-border/80">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Trading</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              This token has graduated to DEX. Use the swap interface to trade.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-zinc-50 flex items-center justify-between">
          <span>Bonding Curve Trading</span>
          {currentPrice && (
            <span className="text-xs font-normal text-muted-foreground">
              Price: {currentPrice} IP/token
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Slippage Settings */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Slippage Tolerance</Label>
          <div className="flex gap-2">
            {[0.1, 0.5, 1.0, 3.0].map((val) => (
              <Button
                key={val}
                variant={slippage === val ? "default" : "outline"}
                size="sm"
                onClick={() => setSlippage(val)}
                className="h-7 text-xs px-3"
              >
                {val}%
              </Button>
            ))}
            <Input
              type="number"
              value={slippage}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val >= 0 && val <= 50) {
                  setSlippage(val);
                }
              }}
              className="h-7 text-xs w-20"
              placeholder="Custom"
            />
          </div>
        </div>

        {/* Buy/Sell Tabs */}
        <Tabs defaultValue="buy" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buy" className="text-xs">
              <TrendingUp className="h-3 w-3 mr-1" />
              Buy
            </TabsTrigger>
            <TabsTrigger value="sell" className="text-xs">
              <TrendingDown className="h-3 w-3 mr-1" />
              Sell
            </TabsTrigger>
          </TabsList>

          {/* Buy Tab */}
          <TabsContent value="buy" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Amount IP to Spend</Label>
              <Input
                type="number"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                placeholder="0.0"
                className="h-10"
              />
            </div>

            {estimatedTokens && (
              <div className="space-y-1 p-3 bg-muted/40 rounded-lg border border-border/60">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Estimated Tokens</span>
                  <span className="font-medium text-foreground">
                    {parseFloat(estimatedTokens).toFixed(6)}
                  </span>
                </div>
                {buyPrice && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Price</span>
                    <span className="font-medium text-foreground">{buyPrice} IP/token</span>
                  </div>
                )}
                {buyPriceImpact !== null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Price Impact</span>
                    <span
                      className={`font-medium ${
                        buyPriceImpact > 5 ? "text-red-400" : "text-foreground"
                      }`}
                    >
                      {buyPriceImpact > 0 ? "+" : ""}
                      {buyPriceImpact.toFixed(2)}%
                    </span>
                  </div>
                )}
                {buyPriceImpact !== null && buyPriceImpact > 5 && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertCircle className="h-3 w-3" />
                    <AlertDescription className="text-xs">
                      High price impact! Consider splitting your trade.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <Button
              onClick={handleBuy}
              disabled={!primaryWallet || !buyAmount || buying || !estimatedTokens}
              variant="buy"
              className="w-full"
            >
              {buying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Buying...
                </>
              ) : (
                <>
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Buy Tokens
                </>
              )}
            </Button>
          </TabsContent>

          {/* Sell Tab */}
          <TabsContent value="sell" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Amount Tokens to Sell</Label>
              <Input
                type="number"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                placeholder="0.0"
                className="h-10"
              />
            </div>

            {estimatedIP && (
              <div className="space-y-1 p-3 bg-muted/40 rounded-lg border border-border/60">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Estimated IP</span>
                  <span className="font-medium text-foreground">
                    {parseFloat(estimatedIP).toFixed(6)}
                  </span>
                </div>
                {sellPrice && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Price</span>
                    <span className="font-medium text-foreground">{sellPrice} IP/token</span>
                  </div>
                )}
                {sellPriceImpact !== null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Price Impact</span>
                    <span
                      className={`font-medium ${
                        sellPriceImpact > 5 ? "text-red-400" : "text-foreground"
                      }`}
                    >
                      {sellPriceImpact > 0 ? "+" : ""}
                      {sellPriceImpact.toFixed(2)}%
                    </span>
                  </div>
                )}
                {sellPriceImpact !== null && sellPriceImpact > 5 && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertCircle className="h-3 w-3" />
                    <AlertDescription className="text-xs">
                      High price impact! Consider splitting your trade.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <Button
              onClick={handleSell}
              disabled={!primaryWallet || !sellAmount || selling || !estimatedIP}
              variant="sell"
              className="w-full"
            >
              {selling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Selling...
                </>
              ) : (
                <>
                  <TrendingDown className="mr-2 h-4 w-4" />
                  Sell Tokens
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>

        {/* Bonding Curve Progress */}
        {launchInfo && (
          <div className="pt-4 border-t border-border/60">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>Progress to Graduation</span>
              <span>{bondingProgress.toFixed(1)}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-2 bg-primary transition-all"
                style={{ width: `${Math.min(100, bondingProgress)}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {bondingProgress >= 100
                ? "Ready to graduate to DEX"
                : `${(100 - bondingProgress).toFixed(1)}% remaining`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

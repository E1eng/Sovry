"use client";

import { useState, useEffect } from "react";
import { useDynamicContext, useIsLoggedIn } from "@dynamic-labs/sdk-react-core";
import { formatEther, parseEther } from "viem";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, DollarSign, TrendingUp, Calendar } from "lucide-react";

// IPRoyaltyVault ABI (simplified for demo)
const IP_ROYALTY_VAULT_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "claimableRevenue",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "claimRevenue",
    outputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "getRevenueHistory",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "timestamp", type: "uint256" },
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "string", name: "description", type: "string" },
        ],
        internalType: "struct IPRoyaltyVault.RevenueEvent[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Mock IP Assets with revenue data
const IP_ASSETS = [
  {
    id: "1",
    name: "Digital Art Collection",
    symbol: "ART-rIP",
    vaultAddress: "0xAbc1234567890123456789012345678901234567" as const,
    totalRevenue: "50000",
    claimableRevenue: "2500",
    lastClaim: "2025-01-15",
    revenueRate: "5%",
    holders: 150,
  },
  {
    id: "2",
    name: "Music Composition Rights",
    symbol: "MUSIC-rIP",
    vaultAddress: "0xDef1234567890123456789012345678901234567" as const,
    totalRevenue: "75000",
    claimableRevenue: "3200",
    lastClaim: "2025-01-14",
    revenueRate: "8%",
    holders: 85,
  },
  {
    id: "3",
    name: "Literary Work License",
    symbol: "BOOK-rIP",
    vaultAddress: "0xGhi1234567890123456789012345678901234567" as const,
    totalRevenue: "32000",
    claimableRevenue: "1800",
    lastClaim: "2025-01-16",
    revenueRate: "6%",
    holders: 200,
  },
];

interface RevenueEvent {
  timestamp: string;
  amount: string;
  description: string;
}

interface UserPosition {
  assetId: string;
  assetName: string;
  symbol: string;
  balance: string;
  claimableRevenue: string;
  totalEarned: string;
  valueUSD: number;
}

export function RevenueClaiming() {
  const { primaryWallet } = useDynamicContext();
  const isConnected = useIsLoggedIn();
  const address = primaryWallet?.address;
  
  const [selectedAsset, setSelectedAsset] = useState(IP_ASSETS[0]);
  const [userPositions, setUserPositions] = useState<UserPosition[]>([]);
  const [revenueHistory, setRevenueHistory] = useState<RevenueEvent[]>([]);
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Mock user positions and revenue data
  useEffect(() => {
    if (isConnected) {
      // In real app, fetch user's rIP positions and claimable revenue
      setUserPositions([
        {
          assetId: "1",
          assetName: "Digital Art Collection",
          symbol: "ART-rIP",
          balance: "100",
          claimableRevenue: "2500",
          totalEarned: "12500",
          valueUSD: 5000,
        },
        {
          assetId: "2",
          assetName: "Music Composition Rights",
          symbol: "MUSIC-rIP",
          balance: "50",
          claimableRevenue: "1600",
          totalEarned: "8000",
          valueUSD: 3000,
        },
      ]);

      // Mock revenue history
      setRevenueHistory([
        {
          timestamp: "2025-01-16",
          amount: "500",
          description: "Artwork licensing revenue",
        },
        {
          timestamp: "2025-01-15",
          amount: "750",
          description: "Music streaming royalties",
        },
        {
          timestamp: "2025-01-14",
          amount: "300",
          description: "Book publication rights",
        },
        {
          timestamp: "2025-01-13",
          amount: "450",
          description: "Digital art sales commission",
        },
        {
          timestamp: "2025-01-12",
          amount: "600",
          description: "Music synchronization license",
        },
      ]);
    }
  }, [isConnected]);

  const handleClaimRevenue = async () => {
    if (!isConnected) {
      return;
    }
    
    setIsClaiming(true);
    setError("");
    
    try {
      // Implement royalty claiming logic
      alert("Revenue claiming will be implemented with Dynamic.xyz wallet integration");
      
      // Simulate successful claim after 2 seconds
      setTimeout(() => {
        // Update user positions
        setUserPositions(prev => prev.map(p => 
          p.assetId === selectedAsset?.id 
            ? { 
                ...p, 
                claimableRevenue: "0", 
                totalEarned: (parseFloat(p.totalEarned) + parseFloat(p.claimableRevenue)).toString() 
              }
            : p
        ));
        setIsClaiming(false);
      }, 2000);

    } catch (err) {
      console.error("Claim revenue failed:", err);
      setError("Failed to claim revenue. Please try again.");
      setIsClaiming(false);
    }
  };

  const totalClaimable = userPositions.reduce((sum, pos) => sum + parseFloat(pos.claimableRevenue), 0);
  const totalEarned = userPositions.reduce((sum, pos) => sum + parseFloat(pos.totalEarned), 0);

  if (!isConnected) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="p-6 text-center">
          <p className="text-zinc-400">Please connect your wallet to claim revenue</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-sovry-green" />
              <div>
                <p className="text-sm text-zinc-400 uppercase tracking-wide">Total Claimable</p>
                <p className="text-2xl font-bold text-sovry-green">${totalClaimable.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-sovry-green" />
              <div>
                <p className="text-sm text-zinc-400 uppercase tracking-wide">Total Earned</p>
                <p className="text-2xl font-bold text-sovry-green">${totalEarned.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-sovry-pink" />
              <div>
                <p className="text-sm text-zinc-400 uppercase tracking-wide">Active Positions</p>
                <p className="text-2xl font-bold text-zinc-50">{userPositions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Claiming */}
        <Card>
          <CardHeader>
            <CardTitle>Claim Your Revenue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Asset Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-50 uppercase tracking-wide">Select IP Asset</label>
              <div className="space-y-2">
                {userPositions.map((position) => (
                  <div
                    key={position.assetId}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedAsset.id === position.assetId
                        ? "border-sovry-green/50 bg-sovry-green/10"
                        : "border-zinc-800 hover:border-zinc-700"
                    }`}
                    onClick={() => setSelectedAsset(IP_ASSETS.find(asset => asset.id === position.assetId) || IP_ASSETS[0])}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-zinc-50">{position.assetName}</h4>
                        <p className="text-sm text-zinc-400">{position.symbol} • {position.balance} tokens</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sovry-green">${position.claimableRevenue}</p>
                        <p className="text-xs text-zinc-400">claimable</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Asset Details */}
            <div className="p-4 bg-zinc-800/30 border border-zinc-700 rounded-lg">
              <h4 className="font-semibold mb-2 text-zinc-50">{selectedAsset.name}</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Revenue Rate:</span>
                  <span className="text-sovry-green font-medium">{selectedAsset.revenueRate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Total Revenue:</span>
                  <span className="text-zinc-50">${selectedAsset.totalRevenue}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Holders:</span>
                  <span className="text-zinc-50">{selectedAsset.holders}</span>
                </div>
              </div>
            </div>

            {/* Error/Success Alert */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {success && (
              <Alert className="border-sovry-green/30 bg-sovry-green/10">
                <AlertDescription className="text-zinc-400">{success}</AlertDescription>
              </Alert>
            )}

            {/* Claim Button */}
            <Button 
              onClick={handleClaimRevenue}
              disabled={isClaiming || totalClaimable <= 0}
              className="w-full"
            >
              {isClaiming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Claiming...
                </>
              ) : (
                `Claim $${userPositions.find(p => p.assetId === selectedAsset.id)?.claimableRevenue || "0"}`
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Revenue History */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Chart Placeholder */}
              <div>
                <h4 className="font-semibold mb-2 text-zinc-50">Revenue Chart</h4>
                <div className="h-48 bg-zinc-800/30 border border-zinc-700 rounded-lg flex items-center justify-center">
                  <span className="text-sm text-zinc-400">Revenue chart coming soon</span>
                </div>
              </div>

              {/* Recent Revenue Events */}
              <div>
                <h4 className="font-semibold mb-2 text-zinc-50">Recent Revenue</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {revenueHistory.map((event, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-zinc-800/30 border border-zinc-700 rounded-lg text-sm">
                      <div>
                        <p className="font-medium text-zinc-50">{event.description}</p>
                        <p className="text-xs text-zinc-400">{event.timestamp}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sovry-green">${event.amount}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-sovry-green/10 border border-sovry-green/30 rounded-lg">
                  <p className="text-sovry-green font-medium">Avg. Daily</p>
                  <p className="text-lg font-bold text-zinc-50">${(totalEarned / 30).toFixed(2)}</p>
                </div>
                <div className="p-3 bg-sovry-green/10 border border-sovry-green/30 rounded-lg">
                  <p className="text-sovry-green font-medium">This Month</p>
                  <p className="text-lg font-bold text-zinc-50">${(totalEarned * 0.1).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle>How Revenue Claiming Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-sovry-green/20 border border-sovry-green/30 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-sovry-green font-bold">1</span>
              </div>
              <h4 className="font-semibold mb-2 text-zinc-50">Hold rIP Tokens</h4>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Purchase and hold rIP tokens to become eligible for revenue sharing
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-sovry-green/20 border border-sovry-green/30 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-sovry-green font-bold">2</span>
              </div>
              <h4 className="font-semibold mb-2 text-zinc-50">Revenue Accumulates</h4>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Revenue from IP licensing is automatically distributed to the IPRoyaltyVault
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-sovry-green/20 border border-sovry-green/30 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-sovry-green font-bold">3</span>
              </div>
              <h4 className="font-semibold mb-2 text-zinc-50">Claim Your Share</h4>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Claim your proportional share of revenue anytime through our dashboard
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

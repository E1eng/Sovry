"use client";

import { useState, useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchWalletIPAssets } from "@/services/storyProtocolService";
import {
  DollarSign,
  TrendingUp,
  Coins,
  Loader2,
} from "lucide-react";

interface PortfolioAsset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  balance: number;
  valueUSD: number;
  claimableRevenue: number;
  apy: string;
  category: string;
}

const MOCK_ASSETS: PortfolioAsset[] = [
  {
    id: "1",
    symbol: "rMUSIC",
    name: "Music Royalties",
    image: "https://ttmbengqanqzfrkjajgk.supabase.co/storage/v1/object/public/images/pack-art/20874abc-latinpack.jpg",
    balance: 1250.5,
    valueUSD: 1563.12,
    claimableRevenue: 45.8,
    apy: "15.8%",
    category: "Music",
  },
  {
    id: "2",
    symbol: "rART",
    name: "Art Royalties",
    image: "https://cdn.pixabay.com/photo/2024/02/28/07/42/easter-8601492_640.jpg",
    balance: 890.25,
    valueUSD: 1112.81,
    claimableRevenue: 28.45,
    apy: "12.3%",
    category: "Art",
  },
  {
    id: "3",
    symbol: "rGAME",
    name: "Game Royalties",
    image: "https://cdn.pixabay.com/photo/2024/01/25/10/38/minecraft-8532000_640.png",
    balance: 2100.0,
    valueUSD: 1365.0,
    claimableRevenue: 67.2,
    apy: "18.2%",
    category: "Gaming",
  },
];

export default function PortfolioPage() {
  const { primaryWallet } = useDynamicContext();
  const walletAddress = primaryWallet?.address;
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHoldings = async () => {
      if (!walletAddress) {
        setAssets([]);
        setLoading(false);
        return;
      }

      try {
        const ipAssets = await fetchWalletIPAssets(walletAddress, primaryWallet);

        if (ipAssets && ipAssets.length > 0) {
          const mappedAssets: PortfolioAsset[] = ipAssets.map((asset) => ({
            id: asset.ipId,
            symbol: "RT",
            name: asset.name,
            image: asset.imageUrl,
            balance: 0,
            valueUSD: 0,
            claimableRevenue: 0,
            apy: "0%",
            category: "IP",
          }));

          setAssets(mappedAssets);
        } else {
          setAssets(MOCK_ASSETS);
        }
      } catch (error) {
        console.error("Error loading holdings:", error);
        setAssets(MOCK_ASSETS);
      } finally {
        setLoading(false);
      }
    };

    loadHoldings();
  }, [walletAddress, primaryWallet]);

  const calculateNetWorth = () => assets.reduce((total, asset) => total + asset.valueUSD, 0);
  const calculateTotalClaimable = () =>
    assets.reduce((total, asset) => total + asset.claimableRevenue, 0);

  if (!walletAddress) {
    return (
      <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
        <CardContent className="p-8 text-center">
          <Coins className="h-12 w-12 mx-auto mb-4 text-zinc-400" />
          <h2 className="text-xl font-semibold text-zinc-50 mb-2">Connect Your Wallet</h2>
          <p className="text-zinc-400">
            Connect your wallet to view your portfolio holdings.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-50 mb-2">Portfolio</h1>
          <p className="text-zinc-400 text-base leading-relaxed">
            View and manage your IP asset holdings
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-zinc-400 text-sm uppercase tracking-wide mb-1">Net Worth</p>
                  <p className="text-2xl font-bold text-zinc-50">${calculateNetWorth().toFixed(2)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-sovry-green" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-zinc-400 text-sm uppercase tracking-wide mb-1">Total Holdings</p>
                  <p className="text-2xl font-bold text-zinc-50">{assets.length}</p>
                </div>
                <Coins className="h-8 w-8 text-sovry-green" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-zinc-400 text-sm uppercase tracking-wide mb-1">Claimable Revenue</p>
                  <p className="text-2xl font-bold text-zinc-50">${calculateTotalClaimable().toFixed(2)}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-sovry-pink" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Holdings List */}
        {loading ? (
          <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
            <CardContent className="p-8 text-center">
              <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-sovry-green" />
              <p className="text-zinc-400">Loading your holdings...</p>
            </CardContent>
          </Card>
        ) : assets.length === 0 ? (
          <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
            <CardContent className="p-8 text-center">
              <Coins className="h-12 w-12 mx-auto mb-4 text-zinc-400" />
              <h2 className="text-xl font-semibold text-zinc-50 mb-2">No Holdings Found</h2>
              <p className="text-zinc-400 mb-4">
                You don't have any IP assets in your portfolio yet.
              </p>
              <Button variant="default" asChild>
                <a href="/create">Create Your First IP</a>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <Card key={asset.id} className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl hover:border-sovry-green/50 transition-colors">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    {asset.image && (
                      <img
                        src={asset.image}
                        alt={asset.name}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate text-zinc-50">{asset.name}</CardTitle>
                      <p className="text-sm text-zinc-400 font-mono">{asset.symbol}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-zinc-400">Balance</span>
                      <span className="text-sm font-semibold text-zinc-50">{asset.balance.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-zinc-400">Value</span>
                      <span className="text-sm font-semibold text-zinc-50">${asset.valueUSD.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-zinc-400">APY</span>
                      <span className="text-sm font-semibold text-sovry-green">{asset.apy}</span>
                    </div>
                    {asset.claimableRevenue > 0 && (
                      <div className="pt-3 border-t border-zinc-800">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-zinc-400">Claimable</span>
                          <span className="text-sm font-semibold text-sovry-pink">
                            ${asset.claimableRevenue.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}


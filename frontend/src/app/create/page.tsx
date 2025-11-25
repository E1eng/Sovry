"use client";

import { useState, useEffect, useRef } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/navigation/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  Wallet,
  AlertCircle,
  Sparkles,
  Coins,
  TrendingUp,
  ArrowRight,
  ExternalLink,
  Crown,
  CheckCircle,
} from "lucide-react";
import {
  fetchWalletIPAssets,
  IPAsset,
  getTokenBalance,
  TokenBalance,
  SOVRY_LAUNCHPAD_ADDRESS,
} from "@/services/storyProtocolService";
import { launchpadService } from "@/services/launchpadService";
import {
  claimRevenue,
  mintLicenseToken,
  transferRoyaltyTokensFromIP,
} from "@/services/storyProtocolRegistration";
import { pinFileToIPFS, pinJSONToIPFS } from "@/services/pinataService";
import { supabase } from "@/lib/supabaseClient";

export default function CreatePage() {
  const { primaryWallet } = useDynamicContext();
  const router = useRouter();
  const isConnected = !!primaryWallet;
  const walletAddress = primaryWallet?.address;

  const [ipAssets, setIpAssets] = useState<IPAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingPool, setCreatingPool] = useState<string | null>(null);
  const [launchStep, setLaunchStep] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedIP, setSelectedIP] = useState<string>("");
  const [tokenBalances, setTokenBalances] = useState<Record<string, TokenBalance>>({});
  const [unlockingTokens, setUnlockingTokens] = useState<string | null>(null);
  const [claimingRevenue, setClaimingRevenue] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbolLaunch, setTokenSymbolLaunch] = useState("");
  const [launchImageUrl, setLaunchImageUrl] = useState("");
  const [launchDescription, setLaunchDescription] = useState("");
  const [launchPercentage, setLaunchPercentage] = useState<number>(100);
  const [launchLogoFile, setLaunchLogoFile] = useState<File | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const handleLogoFileChange = (file: File | null) => {
    setLaunchLogoFile(file);
  };

  useEffect(() => {
    const fetchAssets = async () => {
      if (!isConnected || !walletAddress) return;
      setLoading(true);
      setError(null);
      try {
        const assets = await fetchWalletIPAssets(walletAddress, primaryWallet);
        setIpAssets(assets);

        const balances: Record<string, TokenBalance> = {};
        for (const asset of assets) {
          if (asset.royaltyVaultAddress) {
            const balance = await getTokenBalance(walletAddress, asset.royaltyVaultAddress);
            if (balance) {
              balances[asset.ipId] = balance;
            }
          }
        }
        setTokenBalances(balances);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch IP assets");
      } finally {
        setLoading(false);
      }
    };

    fetchAssets();
  }, [isConnected, walletAddress, primaryWallet]);

  const handleUnlockTokens = async (ipAsset: IPAsset) => {
    if (!walletAddress || !primaryWallet) return;

    setUnlockingTokens(ipAsset.ipId);
    setError(null);
    setSuccess(null);

    try {
      // 1. Mint license token (triggers royalty vault deployment)
      // 2. Transfer royalty tokens from IP Account to user wallet
      const licenseTermsIds = ["1", "2", "3", "10", "100"];
      let licenseResult = { success: false as boolean, txHash: "" };

      for (const termsId of licenseTermsIds) {
        try {
          licenseResult = await mintLicenseToken(ipAsset.ipId, termsId, primaryWallet);
          if (licenseResult.success) break;
        } catch {
          continue;
        }
      }

      if (!licenseResult.success) {
        throw new Error("Failed to mint license token with any license terms ID");
      }

      setSuccess(`License token minted successfully! Transaction: ${licenseResult.txHash}`);

      // Wait for royalty vault deployment
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Transfer royalty tokens from IP Account to wallet
      const transferResult = await transferRoyaltyTokensFromIP(ipAsset.ipId, primaryWallet);

      if (transferResult.success) {
        setSuccess((prev) =>
          (prev || "") + `\n✅ Royalty tokens transferred to your wallet! Transaction: ${transferResult.txHash}`
        );

        // Wait for tokens to appear
        await new Promise((resolve) => setTimeout(resolve, 10000));

        let balance = await getTokenBalance(walletAddress, ipAsset.royaltyVaultAddress);
        if (balance && parseFloat(balance.formattedBalance) > 0) {
          setTokenBalances((prev) => ({ ...prev, [ipAsset.ipId]: balance }));
          setSuccess((prev) =>
            (prev || "") + `\n💰 Your royalty token balance: ${balance.formattedBalance} ${balance.symbol}`
          );

          // Auto-claim all available revenue
          try {
            const claimResult = await claimRevenue(ipAsset.ipId, primaryWallet);
            if (claimResult.success) {
              setSuccess((prev) =>
                (prev || "") + `\n✅ All revenue claimed successfully! Transaction: ${claimResult.txHash}`
              );
            }
          } catch (claimError) {
            setSuccess((prev) =>
              (prev || "") +
              `\n⚠️ Could not auto-claim revenue: ${
                claimError instanceof Error ? claimError.message : "Unknown error"
              }`
            );
          }
        }
      } else {
        setSuccess((prev) =>
          (prev || "") + `\n⚠️ License minted but token transfer failed: ${transferResult.error}`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get royalty tokens");
    } finally {
      setUnlockingTokens(null);
    }
  };

  const handleCreatePool = async (ipAsset: IPAsset) => {
    try {
      setCreatingPool(ipAsset.ipId);
      setLaunchStep(3);
      setError(null);
      setSuccess(null);

      if (!primaryWallet) {
        throw new Error("Please connect your wallet first");
      }

      const nameForLaunch = tokenName || ipAsset.name || "IP Token";
      let symbolForLaunch = tokenSymbolLaunch;
      if (!symbolForLaunch) {
        const base = ipAsset.name || "IP";
        const cleaned = base.replace(/[^A-Za-z0-9]/g, "");
        symbolForLaunch = (cleaned || "IP").slice(0, 10).toUpperCase();
      }

      const result = await launchpadService.launchOnBondingCurve(
        ipAsset.royaltyVaultAddress,
        primaryWallet,
        nameForLaunch,
        symbolForLaunch,
        launchPercentage,
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to launch on bonding curve");
      }

      let metadataUri: string | null = null;
      try {
        let imageUrl = launchImageUrl.trim();
        if (launchLogoFile) {
          const imageRes = await pinFileToIPFS(launchLogoFile, launchLogoFile.name);
          imageUrl = imageRes.gatewayUrl;
        }

        const metadata = {
          name: nameForLaunch,
          symbol: symbolForLaunch,
          description:
            launchDescription || selectedIPAsset.description || "",
          image: imageUrl || undefined,
          attributes: [
            {
              trait_type: "Royalty Token",
              value: ipAsset.royaltyVaultAddress,
            },
            {
              trait_type: "IP ID",
              value: ipAsset.ipId,
            },
          ],
        };

        const metaRes = await pinJSONToIPFS(
          metadata,
          `${symbolForLaunch || nameForLaunch}-wrapper`
        );
        metadataUri = metaRes.uri;

        if (supabase) {
          await supabase.from("launches").insert({
            royalty_token_address: ipAsset.royaltyVaultAddress.toLowerCase(),
            creator_address: walletAddress?.toLowerCase() || null,
            name: nameForLaunch,
            symbol: symbolForLaunch,
            description: launchDescription || null,
            image_url: imageUrl || null,
            metadata_uri: metadataUri,
          });
        }
      } catch (metaError) {
        console.error("Failed to persist wrapper metadata", metaError);
      }

      setLaunchStep(4);
      let lockMessage = "";
      if (walletAddress) {
        try {
          const lockInfo = await launchpadService.getRoyaltyLockInfo(
            ipAsset.royaltyVaultAddress,
            walletAddress
          );
          if (lockInfo) {
            const scale = Math.pow(10, lockInfo.decimals || 18);
            const locked = Number(lockInfo.locked) / scale;
            const remaining = Number(lockInfo.creatorBalance) / scale;
            lockMessage =
              `\nLocked: ${locked.toFixed(4)} ${lockInfo.symbol}, ` +
              `Remaining: ${remaining.toFixed(4)} ${lockInfo.symbol}`;
          }
        } catch (e) {
          console.error("Failed to load royalty lock info", e);
        }
      }

      setSuccess(
        `Token launched on Sovry Launchpad!` +
          `\nApprove Tx: ${result.approveTxHash}` +
          `\nLaunch Tx: ${result.launchTxHash}` +
          `\nLaunchpad contract: ${SOVRY_LAUNCHPAD_ADDRESS.slice(0, 10)}...` +
          (lockMessage || "")
      );

      setSelectedIP("");

      setTimeout(() => {
        router.push("/profile?tab=liquidity");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch on bonding curve");
    } finally {
      setCreatingPool(null);
      setLaunchStep(null);
    }
  };

  const selectedIPAsset = ipAssets.find((asset) => asset.ipId === selectedIP);
  const selectedTokenBalance = selectedIPAsset ? tokenBalances[selectedIPAsset.ipId] : null;
  const needsUnlock = selectedIPAsset
    ? selectedTokenBalance
      ? Number(selectedTokenBalance.balance) <= 0.000001
      : true
    : false;

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/95">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-md mx-auto">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Connect EVM Wallet
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Connect your EVM wallet to register IP assets and launch royalty tokens.
                  </AlertDescription>
                </Alert>

                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-semibold">MetaMask Extension Not Detected</p>
                      <p>Please install MetaMask browser extension first:</p>
                      <div className="flex items-center gap-2">
                        <ExternalLink className="h-4 w-4" />
                        <a
                          href="https://metamask.io/download/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Download MetaMask
                        </a>
                      </div>
                      <p className="text-xs">After installation, refresh this page</p>
                    </div>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/95">
      <Navigation />
      <main className="container mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-primary/10 to-primary/5 rounded-full mb-4 border border-primary/30">
            <Sparkles className="w-4 h-4 text-purple-400 mr-2" />
            <span className="text-sm font-medium text-primary">Create & Launch IP Tokens</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-amber-300 to-primary bg-clip-text text-transparent">
            Turn Your IP Into a Liquid Asset
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Register new IP assets on Story Protocol, mint royalty tokens, and launch them on a bonding curve via SovryLaunchpad.
          </p>
        </div>

        {/* Error / Success */}
        {error && (
          <div className="mb-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {success && (
          <div className="mb-6">
            <Alert>
              <CheckCircle className="h-4 w-4 text-green-400" />
              <AlertDescription className="whitespace-pre-line">{success}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* IP Assets List */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-purple-500/20 rounded-lg border border-purple-500/30">
                <Crown className="h-5 w-5 text-purple-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Your IP Assets</h2>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                <span className="ml-3 text-slate-300">Fetching IP assets...</span>
              </div>
            ) : ipAssets.length === 0 ? (
              <div className="p-6 glass-card rounded-xl border border-slate-500/30">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="h-5 w-5 text-slate-400" />
                  <p className="text-slate-300">No IP assets with royalty tokens found</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {ipAssets.map((ipAsset) => {
                  const tokenBalance = tokenBalances[ipAsset.ipId];
                  const hasTokens = tokenBalance && Number(tokenBalance.balance) > 0.000001;
                  return (
                    <div
                      key={ipAsset.ipId}
                      className={`p-4 glass-card rounded-xl cursor-pointer transition-all duration-300 ${
                        selectedIP === ipAsset.ipId
                          ? "border-purple-500/50 bg-purple-500/10"
                          : "border-slate-500/30 hover:border-purple-500/50 hover:bg-purple-500/5"
                      }`}
                      onClick={() => setSelectedIP(ipAsset.ipId)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h3 className="font-semibold text-white">{ipAsset.name}</h3>
                            {hasTokens && (
                              <div className="px-2 py-1 bg-green-500/20 rounded-full border border-green-500/30">
                                <span className="text-xs text-green-400">Ready</span>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-slate-400 leading-relaxed">{ipAsset.description}</p>
                          <div className="mt-2 text-xs text-gray-500">
                            <p>IP ID: {ipAsset.ipId.slice(0, 10)}...</p>
                            <p>Royalty Vault: {ipAsset.royaltyVaultAddress.slice(0, 10)}...</p>
                          </div>

                          {tokenBalance && (
                            <div className="mt-3 p-3 bg-slate-800/50 rounded-lg border border-slate-600/30">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="p-1 bg-yellow-500/20 rounded border border-yellow-500/30">
                                    <Coins className="h-3 w-3 text-yellow-400" />
                                  </div>
                                  <span className="text-sm font-medium text-white">
                                    {tokenBalance.formattedBalance} {tokenBalance.symbol}
                                  </span>
                                </div>
                                {hasTokens ? (
                                  <div className="px-2 py-1 bg-green-500/20 rounded-full border border-green-500/30">
                                    <span className="text-xs text-green-400">Available</span>
                                  </div>
                                ) : (
                                  <div className="px-2 py-1 bg-orange-500/20 rounded-full border border-orange-500/30">
                                    <span className="text-xs text-orange-400">Needs Unlock</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Create / Launch Form (only launch existing IP assets) */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
                <TrendingUp className="h-5 w-5 text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Launch Existing IP</h2>
            </div>

            {/* Selected IP + Launch */}
            {selectedIPAsset ? (
              <div className="space-y-4">
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                  <h3 className="font-medium text-blue-300 mb-2">Selected IP Asset</h3>
                  <p className="text-sm text-blue-200">{selectedIPAsset.name}</p>
                  <p className="text-xs text-blue-400 mt-1">
                    Royalty Token: {selectedIPAsset.royaltyVaultAddress.slice(0, 10)}...
                  </p>
                </div>

                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                  <h3 className="font-medium text-green-300 mb-2">Story Protocol Pair Details</h3>
                  <p className="text-sm text-green-200">
                    Royalty Token + WIP pair on SovryRouter will be created automatically when this launch graduates to
                    the DEX.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="p-4 glass-card border border-purple-500/30 bg-purple-500/10">
                    <div className="flex items-center space-x-2 mb-2">
                      <Sparkles className="h-4 w-4 text-purple-400" />
                      <p className="text-sm font-medium text-purple-300">Launch on SovryLaunchpad</p>
                    </div>
                    <p className="text-sm text-purple-200">
                      Launch your royalty token on a bonding curve. No need to provide initial IP liquidity – SovryLaunchpad
                      handles curve mechanics and graduation to DEX.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">Token Name (for DEX)</Label>
                      <Input
                        value={tokenName}
                        onChange={(e) => setTokenName(e.target.value)}
                        placeholder={selectedIPAsset.name || "Super Meme"}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">Token Symbol</Label>
                      <Input
                        value={tokenSymbolLaunch}
                        onChange={(e) => setTokenSymbolLaunch(e.target.value.toUpperCase().slice(0, 10))}
                        placeholder="MEME"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">Token Logo (file)</Label>
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const file = e.dataTransfer.files?.[0] || null;
                          if (file) {
                            handleLogoFileChange(file);
                          }
                        }}
                        onClick={() => logoInputRef.current?.click()}
                        className="h-20 border border-dashed border-slate-500/60 rounded-md px-3 py-2 text-[11px] text-slate-300 flex items-center cursor-pointer bg-slate-900/40"
                      >
                        <span className="truncate">
                          {launchLogoFile
                            ? launchLogoFile.name
                            : "Drag & drop image here, or click to browse"}
                        </span>
                      </div>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          handleLogoFileChange(e.target.files?.[0] || null)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">Token Description (optional)</Label>
                      <Input
                        value={launchDescription}
                        onChange={(e) => setLaunchDescription(e.target.value)}
                        placeholder="Short description for this wrapped IP token"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 mt-2">
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>Percentage to Launch</span>
                      <span className="font-medium">{launchPercentage}%</span>
                    </div>
                    <Slider
                      value={[launchPercentage]}
                      min={1}
                      max={100}
                      step={1}
                      onValueChange={(v) => setLaunchPercentage(v[0] ?? 1)}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      You are selling {launchPercentage}% of your IP rights. You keep {100 - launchPercentage}% in your wallet.
                    </p>
                  </div>

                  {needsUnlock && (
                    <div className="space-y-4">
                      <div className="p-4 glass-card border border-orange-500/30 bg-orange-500/10">
                        <div className="flex items-center space-x-3">
                          <Coins className="h-5 w-5 text-orange-400" />
                          <div>
                            <p className="text-sm font-medium text-orange-300">Royalty Tokens Required</p>
                            <p className="text-xs text-orange-400 mt-1">
                              Get royalty tokens before launching. This will mint a license, deploy the vault, and transfer
                              royalty tokens to your wallet.
                            </p>
                          </div>
                        </div>
                      </div>

                      <Button
                        onClick={() => handleUnlockTokens(selectedIPAsset)}
                        disabled={unlockingTokens === selectedIPAsset.ipId}
                        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                      >
                        {unlockingTokens === selectedIPAsset.ipId ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Getting Royalty Tokens...
                          </>
                        ) : (
                          <>
                            <Coins className="mr-2 h-4 w-4" />
                            Get Royalty Tokens
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  <Button
                    onClick={() => handleCreatePool(selectedIPAsset)}
                    disabled={creatingPool === selectedIPAsset.ipId || needsUnlock}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creatingPool === selectedIPAsset.ipId ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Launching on Bonding Curve...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="mr-2 h-4 w-4" />
                        Launch on Bonding Curve
                      </>
                    )}
                  </Button>

                  <div className="mt-4 space-y-2 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-medium">2.</span>
                      {needsUnlock ? (
                        unlockingTokens === selectedIPAsset.ipId ? (
                          <Loader2 className="h-3 w-3 animate-spin text-orange-300" />
                        ) : (
                          <span className="text-orange-300">⏳</span>
                        )
                      ) : (
                        <CheckCircle className="h-3 w-3 text-emerald-400" />
                      )}
                      <span>Minting Royalty Tokens / unlock token</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-medium">3.</span>
                      {creatingPool === selectedIPAsset.ipId && launchStep === 3 ? (
                        <Loader2 className="h-3 w-3 animate-spin text-blue-300" />
                      ) : launchStep !== null && launchStep > 3 ? (
                        <CheckCircle className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <span className="text-blue-300">⏳</span>
                      )}
                      <span>Approving Launchpad...</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-medium">4.</span>
                      {creatingPool === selectedIPAsset.ipId && launchStep === 4 ? (
                        <Loader2 className="h-3 w-3 animate-spin text-emerald-300" />
                      ) : launchStep !== null && launchStep >= 4 ? (
                        <CheckCircle className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <span className="text-emerald-300">⏳</span>
                      )}
                      <span>
                        Launching Market...
                        {creatingPool === selectedIPAsset.ipId && launchStep === 4 && (
                          <span className="ml-1">🚀</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 glass-card border border-slate-500/40 text-center text-sm text-muted-foreground">
                Select an IP asset on the left to launch it on SovryLaunchpad.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

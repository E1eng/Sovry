"use client";

import { useState, useEffect, useRef } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useRouter } from "next/navigation";
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

  // Auto-populate image from Story Protocol when IP is selected
  useEffect(() => {
    if (selectedIPAsset?.imageUrl) {
      setLaunchImageUrl(selectedIPAsset.imageUrl);
      // Clear manual upload when auto-populating from Story Protocol
      setLaunchLogoFile(null);
    }
  }, [selectedIP]);

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
        // Use Story Protocol image as primary source, manual upload as override
        let imageUrl = "";
        if (launchLogoFile) {
          // Manual upload takes precedence
          const imageRes = await pinFileToIPFS(launchLogoFile, launchLogoFile.name);
          imageUrl = imageRes.gatewayUrl;
        } else if (launchImageUrl.trim()) {
          // Use Story Protocol image
          imageUrl = launchImageUrl.trim();
        } else if (ipAsset.imageUrl) {
          // Fallback to IP asset image
          imageUrl = ipAsset.imageUrl;
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
      <div className="max-w-md mx-auto">
            <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold text-zinc-50">
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
                          className="text-[#39FF14] hover:underline"
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
    );
  }

  return (
    <>
        {/* Hero */}
        <div className="text-center mb-8 space-y-4">
          <div className="inline-flex items-center px-4 py-2 bg-sovry-green/10 rounded-full border border-sovry-green/30">
            <Sparkles className="w-4 h-4 text-sovry-green mr-2" />
            <span className="text-sm font-medium text-sovry-green uppercase tracking-wide">Create & Launch IP Tokens</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-zinc-50 tracking-tight">
            Turn Your IP Into a Liquid Asset
          </h1>
          <p className="text-zinc-400 text-base leading-relaxed max-w-2xl mx-auto">
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
              <CheckCircle className="h-4 w-4 text-sovry-green" />
              <AlertDescription className="whitespace-pre-line">{success}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* IP Assets List */}
          <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-sovry-green/20 rounded-lg border border-sovry-green/30">
                <Crown className="h-5 w-5 text-sovry-green" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-50">Your IP Assets</h2>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-sovry-green" />
                <span className="ml-3 text-zinc-400">Fetching IP assets...</span>
              </div>
            ) : ipAssets.length === 0 ? (
              <div className="p-6 bg-zinc-800/30 border border-zinc-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="h-5 w-5 text-zinc-400" />
                  <p className="text-zinc-400">No IP assets with royalty tokens found</p>
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
                      className={`p-4 bg-zinc-900/50 backdrop-blur-sm border rounded-xl cursor-pointer transition-all duration-300 ${
                        selectedIP === ipAsset.ipId
                          ? "border-sovry-green/50 bg-sovry-green/10"
                          : "border-zinc-800 hover:border-sovry-green/50 hover:bg-sovry-green/5"
                      }`}
                      onClick={() => setSelectedIP(ipAsset.ipId)}
                    >
                      <div className="flex items-start gap-3">
                        {/* IP Image Preview */}
                        {ipAsset.imageUrl && (
                          <div className="flex-shrink-0">
                            <img
                              src={ipAsset.imageUrl}
                              alt={ipAsset.name}
                              className="w-16 h-16 rounded-lg object-cover border border-zinc-800/50"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = "none";
                              }}
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-2">
                            <h3 className="font-semibold text-zinc-50 truncate">{ipAsset.name}</h3>
                            {hasTokens && (
                              <div className="px-2 py-1 bg-sovry-green/20 rounded-full border border-sovry-green/30 flex-shrink-0">
                                <span className="text-xs text-sovry-green font-semibold uppercase tracking-wider">Ready</span>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2">{ipAsset.description}</p>
                          <div className="mt-2 text-xs text-muted-foreground">
                            <p>IP ID: {ipAsset.ipId.slice(0, 10)}...</p>
                            <p>Royalty Vault: {ipAsset.royaltyVaultAddress.slice(0, 10)}...</p>
                          </div>

                          {tokenBalance && (
                            <div className="mt-3 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="p-1 bg-sovry-green/20 rounded border border-sovry-green/30">
                                    <Coins className="h-3 w-3 text-sovry-green" />
                                  </div>
                                  <span className="text-sm font-medium text-zinc-50">
                                    {tokenBalance.formattedBalance} {tokenBalance.symbol}
                                  </span>
                                </div>
                                {hasTokens ? (
                                  <div className="px-2 py-1 bg-sovry-green/20 rounded-full border border-sovry-green/30">
                                    <span className="text-xs text-sovry-green font-semibold uppercase tracking-wider">Available</span>
                                  </div>
                                ) : (
                                  <div className="px-2 py-1 bg-sovry-pink/20 rounded-full border border-sovry-pink/30">
                                    <span className="text-xs text-sovry-pink font-semibold uppercase tracking-wider">Needs Unlock</span>
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
          <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-sovry-green/20 rounded-lg border border-sovry-green/30">
                <TrendingUp className="h-5 w-5 text-sovry-green" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-50">Launch Existing IP</h2>
            </div>

            {/* Selected IP + Launch */}
            {selectedIPAsset ? (
              <div className="space-y-4">
                <div className="p-4 bg-sovry-green/10 border border-sovry-green/30 rounded-xl">
                  <h3 className="font-medium text-sovry-green mb-3">Selected IP Asset</h3>
                  <div className="flex items-start gap-4">
                    {/* IP Image Preview */}
                    {selectedIPAsset.imageUrl && (
                      <div className="flex-shrink-0">
                        <img
                          src={selectedIPAsset.imageUrl}
                          alt={selectedIPAsset.name}
                          className="w-24 h-24 rounded-lg object-cover border-2 border-sovry-green/30"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                          }}
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-sovry-green font-medium mb-1">{selectedIPAsset.name}</p>
                      <p className="text-xs text-zinc-400">
                        Royalty Token: {selectedIPAsset.royaltyVaultAddress.slice(0, 10)}...
                      </p>
                      {selectedIPAsset.imageUrl && (
                        <p className="text-xs text-zinc-500 mt-2">
                          ✓ Image loaded from Story Protocol
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-sovry-green/10 border border-sovry-green/30 rounded-xl">
                  <h3 className="font-medium text-sovry-green mb-2">Story Protocol Pair Details</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Royalty Token + WIP pair on SovryRouter will be created automatically when this launch graduates to
                    the DEX.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-zinc-800/30 border border-sovry-green/30 rounded-lg">
                    <div className="flex items-center space-x-2 mb-2">
                      <Sparkles className="h-4 w-4 text-sovry-green" />
                      <p className="text-sm font-medium text-sovry-green">Launch on SovryLaunchpad</p>
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      Launch your royalty token on a bonding curve. No need to provide initial IP liquidity – SovryLaunchpad
                      handles curve mechanics and graduation to DEX.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-sm font-medium uppercase tracking-wide">Token Name (for DEX)</Label>
                      <Input
                        value={tokenName}
                        onChange={(e) => setTokenName(e.target.value)}
                        placeholder={selectedIPAsset.name || "Super Meme"}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-sm font-medium uppercase tracking-wide">Token Symbol</Label>
                      <Input
                        value={tokenSymbolLaunch}
                        onChange={(e) => setTokenSymbolLaunch(e.target.value.toUpperCase().slice(0, 10))}
                        placeholder="MEME"
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
                      />
                    </div>
                  </div>

                  {/* Image Preview Section */}
                  {selectedIPAsset.imageUrl && (
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-sm font-medium uppercase tracking-wide">Token Logo Preview</Label>
                      <div className="relative">
                        <img
                          src={launchImageUrl || selectedIPAsset.imageUrl}
                          alt="Token logo preview"
                          className="w-full h-32 rounded-lg object-cover border border-zinc-800 bg-zinc-900/40"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = selectedIPAsset.imageUrl || "/placeholder-ip.png";
                          }}
                        />
                        {launchLogoFile && (
                          <div className="absolute top-2 right-2 px-2 py-1 bg-sovry-green/90 rounded text-xs text-black font-medium">
                            Custom Upload
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500">
                        Using image from Story Protocol. You can override with a custom image below if needed.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-sm font-medium uppercase tracking-wide">
                        Custom Logo (optional override)
                      </Label>
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
                        className="h-20 border border-dashed border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-400 flex items-center cursor-pointer bg-zinc-900 hover:border-zinc-600 transition-colors"
                      >
                        <span className="truncate">
                          {launchLogoFile
                            ? launchLogoFile.name
                            : selectedIPAsset.imageUrl
                            ? "Click to override with custom image"
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
                      {launchLogoFile && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            setLaunchLogoFile(null);
                            setLaunchImageUrl(selectedIPAsset?.imageUrl || "");
                          }}
                        >
                          Reset to Story Protocol image
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-sm font-medium uppercase tracking-wide">Token Description (optional)</Label>
                      <Input
                        value={launchDescription}
                        onChange={(e) => setLaunchDescription(e.target.value)}
                        placeholder="Short description for this wrapped IP token"
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-zinc-400">
                      <span>Percentage to Launch</span>
                      <span className="font-medium text-zinc-50">{launchPercentage}%</span>
                    </div>
                    <Slider
                      value={[launchPercentage]}
                      min={1}
                      max={100}
                      step={1}
                      onValueChange={(v) => setLaunchPercentage(v[0] ?? 1)}
                    />
                    <p className="text-xs text-zinc-500">
                      You are selling {launchPercentage}% of your IP rights. You keep {100 - launchPercentage}% in your wallet.
                    </p>
                  </div>

                  {needsUnlock && (
                    <div className="space-y-4">
                      <div className="p-4 bg-zinc-800/30 border border-sovry-pink/30 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Coins className="h-5 w-5 text-sovry-pink" />
                          <div>
                            <p className="text-sm font-medium text-sovry-pink">Royalty Tokens Required</p>
                            <p className="text-xs text-zinc-400 leading-relaxed mt-1">
                              Get royalty tokens before launching. This will mint a license, deploy the vault, and transfer
                              royalty tokens to your wallet.
                            </p>
                          </div>
                        </div>
                      </div>

                      <Button
                        onClick={() => handleUnlockTokens(selectedIPAsset)}
                        disabled={unlockingTokens === selectedIPAsset.ipId}
                        variant="default"
                        className="w-full"
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
                    variant="default"
                    className="w-full"
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

                  <div className="mt-4 space-y-2 text-sm text-zinc-400">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 font-medium">1.</span>
                      <CheckCircle className="h-3 w-3 text-sovry-green" />
                      <span>IP Asset Registered (from Story Protocol)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 font-medium">2.</span>
                      {needsUnlock ? (
                        unlockingTokens === selectedIPAsset.ipId ? (
                          <Loader2 className="h-3 w-3 animate-spin text-sovry-green" />
                        ) : (
                          <span className="text-sovry-green">⏳</span>
                        )
                      ) : (
                        <CheckCircle className="h-3 w-3 text-sovry-green" />
                      )}
                      <span>Minting Royalty Tokens / unlock token</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 font-medium">3.</span>
                      {creatingPool === selectedIPAsset.ipId && launchStep === 3 ? (
                        <Loader2 className="h-3 w-3 animate-spin text-sovry-green" />
                      ) : launchStep !== null && launchStep > 3 ? (
                        <CheckCircle className="h-3 w-3 text-sovry-green" />
                      ) : (
                        <span className="text-sovry-green">⏳</span>
                      )}
                      <span>Approving Launchpad...</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 font-medium">4.</span>
                      {creatingPool === selectedIPAsset.ipId && launchStep === 4 ? (
                        <Loader2 className="h-3 w-3 animate-spin text-sovry-green" />
                      ) : launchStep !== null && launchStep >= 4 ? (
                        <CheckCircle className="h-3 w-3 text-sovry-green" />
                      ) : (
                        <span className="text-sovry-green">⏳</span>
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
              <div className="p-6 bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl text-center text-sm text-zinc-400">
                Select an IP asset on the left to launch it on SovryLaunchpad.
              </div>
            )}
          </div>
        </div>
    </>
  );
}
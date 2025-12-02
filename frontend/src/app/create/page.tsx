"use client";

import { useState, useEffect, useRef } from "react";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileUpload } from "@/components/ui/file-upload";
import toast from "react-hot-toast";

import {
  Loader2,
  AlertCircle,
  Sparkles,
  Coins,
  TrendingUp,
  ArrowRight,
  CheckCircle,
  PlusCircle,
} from "lucide-react";

import Link from "next/link";
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

  const { primaryWallet, setShowAuthFlow } = useDynamicContext();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [mintStatus, setMintStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [transferStatus, setTransferStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [claimStatus, setClaimStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbolLaunch, setTokenSymbolLaunch] = useState("");
  const [launchImageUrl, setLaunchImageUrl] = useState("");
  const [launchDescription, setLaunchDescription] = useState("");
  const [launchPercentage, setLaunchPercentage] = useState<number>(100);
  const [launchLogoFile, setLaunchLogoFile] = useState<File | null>(null);
  const [twitterUrl, setTwitterUrl] = useState("");
  const [telegramUrl, setTelegramUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [launchedTokenAddress, setLaunchedTokenAddress] = useState<string | null>(null);
  const [launchedTokenSymbol, setLaunchedTokenSymbol] = useState<string | null>(null);

  const displayIPAssets = ipAssets;

  const handleLogoFileChange = (file: File | null) => {
    setLaunchLogoFile(file);
  };

  // Handle IP pre-selection from URL params (for Remix functionality)
  useEffect(() => {
    const ipIdParam = searchParams.get("ipId");
    if (ipIdParam && ipAssets.length > 0) {
      const matchingAsset = ipAssets.find((asset) => asset.ipId.toLowerCase() === ipIdParam.toLowerCase());
      if (matchingAsset) {
        setSelectedIP(matchingAsset.ipId);
      }
    }
  }, [searchParams, ipAssets]);

  // Auto-populate fields from Story Protocol when IP is selected
  useEffect(() => {
    if (!selectedIP) return;

    const asset = displayIPAssets.find((a) => a.ipId === selectedIP);
    if (!asset) return;

    if (asset.imageUrl) {
      setLaunchImageUrl(asset.imageUrl);
      // Clear manual upload when auto-populating from Story Protocol
      setLaunchLogoFile(null);
    }

    if (asset.name) {
      setTokenName(asset.name);
    }

    if (asset.description) {
      setLaunchDescription(asset.description);
    }
  }, [selectedIP, displayIPAssets]);

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
    // Do not touch global success banner here; use toasts for unlock flow
    setMintStatus("pending");
    setTransferStatus("idle");
    setClaimStatus("idle");

    try {
      // 1. Mint license token (triggers royalty vault deployment)
      // 2. Transfer royalty tokens from IP Account to user wallet
      const licenseTermsIds = ["1", "2", "3", "10", "100"];
      let licenseResult: { success: boolean; txHash?: string } = { success: false };

      for (const termsId of licenseTermsIds) {
        try {
          licenseResult = await mintLicenseToken(ipAsset.ipId, termsId, primaryWallet);
          if (licenseResult.success && licenseResult.txHash) break;
        } catch {
          continue;
        }
      }

      if (!licenseResult.success || !licenseResult.txHash) {
        setMintStatus("error");
        throw new Error("Failed to mint license token with any license terms ID");
      }

      setMintStatus("success");
      toast.success("License token minted", {
        duration: 3500,
      });

      // Wait for royalty vault deployment
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Transfer royalty tokens from IP Account to wallet
      setTransferStatus("pending");
      const transferResult = await transferRoyaltyTokensFromIP(ipAsset.ipId, primaryWallet);

      if (transferResult.success) {
        setTransferStatus("success");
        toast.success("Royalty tokens transferred to your wallet", {
          duration: 3500,
        });

        // Wait for tokens to appear
        await new Promise((resolve) => setTimeout(resolve, 10000));

        let balance = await getTokenBalance(walletAddress, ipAsset.royaltyVaultAddress);
        if (balance && parseFloat(balance.balance) > 0.000001) {
          setTokenBalances((prev) => ({ ...prev, [ipAsset.ipId]: balance }));
          toast.success(`Royalty token balance updated: ${balance.balance} ${balance.symbol}`, {
            duration: 3500,
          });

          // Auto-claim all available revenue
          try {
            const claimResult = await claimRevenue(ipAsset.ipId, primaryWallet);
            if (claimResult.success) {
              setClaimStatus("success");
              toast.success("All revenue claimed successfully", {
                duration: 3500,
              });
            }
          } catch (claimError) {
            setClaimStatus("error");
            toast.error("Could not auto-claim revenue", {
              duration: 4000,
            });
          }
        }
      } else {
        setTransferStatus("error");
        toast.error("Royalty token transfer failed", {
          duration: 4000,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get royalty tokens";
      setError(message);
      toast.error(message, {
        duration: 4000,
      });
    } finally {
      setUnlockingTokens(null);
      setMintStatus((prev) => (prev === "pending" ? "error" : prev));
      setTransferStatus((prev) => (prev === "pending" ? "error" : prev));
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
            launchDescription || selectedIPAsset?.description || "",
          external_url: websiteUrl || undefined,
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
          links: {
            twitter: twitterUrl || undefined,
            telegram: telegramUrl || undefined,
            website: websiteUrl || undefined,
          },
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
            twitter_url: twitterUrl.trim() || null,
            telegram_url: telegramUrl.trim() || null,
            website_url: websiteUrl.trim() || null,
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
        `Launch Successful` +
          `\n• Approve Tx: ${result.approveTxHash}` +
          `\n• Launch Tx: ${result.launchTxHash}` +
          `\n• Launchpad: ${SOVRY_LAUNCHPAD_ADDRESS.slice(0, 10)}...` +
          (lockMessage || "")
      );

      setTwitterUrl("");
      setTelegramUrl("");
      setWebsiteUrl("");
      setSelectedIP("");

      // Open post-launch modal with links (use royalty vault / royalty token address for now)
      setLaunchedTokenAddress(ipAsset.royaltyVaultAddress);
      setLaunchedTokenSymbol(symbolForLaunch);
      setShowLaunchModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch on bonding curve");
    } finally {
      setCreatingPool(null);
      setLaunchStep(null);
    }
  };

  const selectedIPAsset = displayIPAssets.find((asset) => asset.ipId === selectedIP);
  const selectedTokenBalance = selectedIPAsset ? tokenBalances[selectedIPAsset.ipId] : null;
  const needsUnlock = selectedIPAsset
    ? selectedTokenBalance
      ? Number(selectedTokenBalance.balance) <= 0.000001
      : true
    : false;

  const isStep1Done = !!selectedIPAsset;
  const isStep2InProgress = !!selectedIPAsset && unlockingTokens === selectedIPAsset.ipId;
  const isStep2Done = !!selectedIPAsset && !needsUnlock;
  const isStep3InProgress = !!selectedIPAsset && creatingPool === selectedIPAsset.ipId;
  const isStep3Done = !!success;

  const isStep1Active = !isStep1Done;
  const isStep2Active = isStep1Done && !isStep2Done;
  const isStep3Active = isStep1Done && isStep2Done && !isStep3Done;

  let currentStep = 1;
  let currentStepLabel = "Select IP Asset";

  if (!selectedIPAsset) {
    currentStep = 1;
    currentStepLabel = "Select IP Asset";
  } else if (selectedIPAsset && needsUnlock) {
    currentStep = 2;
    currentStepLabel = "Get Royalty Tokens";
  } else if (selectedIPAsset && !needsUnlock) {
    currentStep = 3;
    currentStepLabel = "Launch";
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 md:px-6 lg:px-8 py-8 sm:py-12">
      <div className="w-full space-y-8">

        {/* Hero */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-4 max-w-2xl">
            <div className="inline-flex items-center px-4 py-2 bg-sovry-green/10 rounded-full border border-sovry-green/30">
              <Sparkles className="w-4 h-4 text-sovry-green mr-2" />
              <span className="text-sm font-medium text-sovry-green uppercase tracking-wide">
                Create & Launch IP Tokens
              </span>
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl md:text-5xl font-bold text-zinc-50 tracking-tight">
                Turn Your IP Into a Liquid Asset
              </h1>
              <p className="text-zinc-400 text-base leading-relaxed">
                Select an IP asset, configure basic token details, and launch directly onto the Sovry bonding curve.
              </p>
            </div>
          </div>

          <Card className="hidden md:block bg-zinc-900 border border-zinc-800 max-w-sm w-full">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-zinc-100">Launch flow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-zinc-400">
              {/* Step 1: Select IP asset */}
              <div className="space-y-1">
                <div
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 ${
                    isStep1Active ? "bg-zinc-900/70" : ""
                  }`}
                >
                  {isStep1Done ? (
                    <CheckCircle className="h-3 w-3 text-sovry-green" />
                  ) : (
                    <div className="h-2.5 w-2.5 rounded-full border border-zinc-500" />
                  )}
                  <span className="font-medium text-[11px] text-zinc-200">
                    1. Select IP Asset
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 ml-6">
                  Choose an IP with an associated Royalty Vault.
                </p>
              </div>

              {/* Step 2: Get Royalty Tokens */}
              <div className="space-y-1">
                <div
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 ${
                    isStep2Active ? "bg-zinc-900/70" : ""
                  }`}
                >
                  {isStep2InProgress ? (
                    <Loader2 className="h-3 w-3 animate-spin text-sovry-green" />
                  ) : isStep2Done ? (
                    <CheckCircle className="h-3 w-3 text-sovry-green" />
                  ) : (
                    <div className="h-2.5 w-2.5 rounded-full border border-zinc-500" />
                  )}
                  <span className="font-medium text-[11px] text-zinc-200">
                    2. Get Royalty Tokens (optional)
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 ml-6">
                  Mint license & transfer Royalty Tokens to your wallet.
                </p>
              </div>

              {/* Step 3: Launch on SovryLaunchpad */}
              <div className="space-y-1">
                <div
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 ${
                    isStep3Active ? "bg-zinc-900/70" : ""
                  }`}
                >
                  {isStep3InProgress ? (
                    <Loader2 className="h-3 w-3 animate-spin text-sovry-green" />
                  ) : isStep3Done ? (
                    <CheckCircle className="h-3 w-3 text-sovry-green" />
                  ) : (
                    <div className="h-2.5 w-2.5 rounded-full border border-zinc-500" />
                  )}
                  <span className="font-medium text-[11px] text-zinc-200">
                    3. Launch on SovryLaunchpad
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 ml-6">
                  Set name, symbol & percentage, then confirm launch.
                </p>
              </div>
            </CardContent>
          </Card>
        </header>

        {/* Connect wallet banner */}
        {!isConnected && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-zinc-100">Wallet not connected</p>
                <p className="text-xs text-zinc-400">
                  Connect your wallet to see your IP assets and launch tokens.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setShowAuthFlow?.(true)}
            >
              Connect Wallet
            </Button>
          </div>
        )}

        {/* Error / Success */}
        {error && (
          <div className="mb-2">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {success && (
          <div className="mb-2">
            <Alert>
              <CheckCircle className="h-4 w-4 text-sovry-green" />
              <AlertDescription className="whitespace-pre-line">{success}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Create / Launch Form (only launch existing IP assets) */}
        <div className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl p-6 md:px-8 md:py-8 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">

          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sovry-green/60 to-transparent" />
          {/* Mobile step indicator */}
          <div className="mb-3 md:hidden">
            <p className="text-[11px] text-zinc-500">
              {`Step ${currentStep}/3 – ${currentStepLabel}`}
            </p>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-sovry-green/20 rounded-lg border border-sovry-green/30">
              <TrendingUp className="h-5 w-5 text-sovry-green" />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-zinc-50">Launch Existing IP</h2>
              {(loading || !!creatingPool || !!unlockingTokens) && (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
              )}
            </div>
          </div>

          {/* Other Available IPs to Launch */}
          <div className="space-y-3">
            <p className="text-sm text-zinc-400 mb-4">
              Browse and select an IP asset from your connected wallet to launch.
            </p>
            {loading ? (
              <div className="flex items-center justify-center py-10 text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span>Loading your IP assets...</span>
              </div>
            ) : displayIPAssets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/70 px-4 py-6 text-center space-y-3">
                <p className="text-sm text-zinc-300 font-medium">No IP assets found in your connected wallet.</p>
                <p className="text-xs text-zinc-500">
                  Register an IP on Story Protocol to start launching tokens on Sovry.
                </p>
                <div className="flex justify-center">
                  <Link
                    href="https://story.foundation/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-sovry-green/40 bg-sovry-green/10 px-4 py-2 text-xs font-medium text-sovry-green hover:bg-sovry-green/20 transition-colors"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>Register IP on Story Protocol</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 max-h-[420px] overflow-y-auto pr-1">
                  {displayIPAssets.slice(0, 6).map((ipAsset) => {
                    const tokenBalance = tokenBalances[ipAsset.ipId];
                    const hasTokens = tokenBalance && Number(tokenBalance.balance) > 0.000001;
                    return (
                      <div
                        key={ipAsset.ipId}
                        className={`group overflow-hidden rounded-2xl border bg-zinc-950/80 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-[0_0_40px_rgba(34,197,94,0.08)] ${
                          selectedIP === ipAsset.ipId
                            ? "border-sovry-green/80 bg-zinc-900/80"
                            : "border-zinc-800/80 hover:border-sovry-green/60 hover:bg-zinc-900/80"
                        }`}
                        onClick={() => setSelectedIP(ipAsset.ipId)}
                      >
                        {ipAsset.imageUrl && (
                          <div className="relative w-full aspect-square">
                            <img
                              src={ipAsset.imageUrl}
                              alt={ipAsset.name}
                              className="absolute inset-0 w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = "none";
                              }}
                            />
                          </div>
                        )}
                        <div className="p-2.5 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-zinc-50 truncate text-sm">{ipAsset.name}</h3>
                              {selectedIP === ipAsset.ipId && (
                                <p className="text-[10px] text-sovry-green mt-0.5">Selected</p>
                              )}
                            </div>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${
                                hasTokens
                                  ? "bg-sovry-green/10 text-sovry-green border-sovry-green/30"
                                  : "bg-zinc-800/60 text-zinc-400 border-zinc-700"
                              }`}
                            >
                              {hasTokens ? "Ready" : "Locked"}
                            </span>
                          </div>
                          {ipAsset.description && (
                            <p className="text-xs text-zinc-400 line-clamp-2 mt-1">{ipAsset.description}</p>
                          )}
                          {tokenBalance && (
                            <p className="text-[11px] text-zinc-500 pt-1">
                              RT Balance:{" "}
                              <span className="text-zinc-200">
                                {tokenBalance.balance} {tokenBalance.symbol}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {displayIPAssets.length > 6 && (
                  <p className="text-xs text-zinc-500 text-center mt-2">
                    Showing 6 of {displayIPAssets.length} available IPs. Select one to launch.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Selected IP + Launch */}
        {selectedIPAsset ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-sovry-green/80" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                    Selected IP & Launch
                  </p>
                </div>
                <span className="text-[11px] text-zinc-500">Detail Panel</span>
              </div>
              <div className="h-px w-full bg-gradient-to-r from-transparent via-zinc-700/70 to-transparent" />
            </div>

            {/* Selected IP summary */}
            <div className="p-4 md:p-5 rounded-2xl border border-zinc-800 bg-zinc-900/80">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Selected IP Asset</h3>
              <div className="flex items-start gap-4">
                {selectedIPAsset.imageUrl && (
                  <div className="flex-shrink-0">
                    <img
                      src={selectedIPAsset.imageUrl}
                      alt={selectedIPAsset.name}
                      className="w-24 h-24 rounded-xl object-cover border border-zinc-800"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                      }}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-zinc-50">{selectedIPAsset.name}</p>
                  <p className="text-xs text-zinc-400">
                    Royalty Token: {selectedIPAsset.royaltyVaultAddress.slice(0, 10)}...
                  </p>
                </div>
              </div>
            </div>

            {/* Launch config */}
            <div className="space-y-4">
              <div className="p-4 md:p-5 rounded-2xl border border-zinc-800 bg-zinc-900/80 space-y-4">

                {/* Token Basics */}
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Token Basics
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs font-medium uppercase tracking-wide">
                        Token Name (for DEX)
                      </Label>
                      <Input
                        value={tokenName}
                        onChange={(e) => setTokenName(e.target.value)}
                        placeholder={selectedIPAsset.name || "Super Meme"}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
                      />
                      <p className="text-[11px] text-zinc-500">
                        Visible di DEX & Sovry, bisa beda dari nama IP awal.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs font-medium uppercase tracking-wide">
                        Token Symbol
                      </Label>
                      <Input
                        value={tokenSymbolLaunch}
                        onChange={(e) =>
                          setTokenSymbolLaunch(e.target.value.toUpperCase().slice(0, 10))
                        }
                        placeholder="MEME"
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
                      />
                      <p className="text-[11px] text-zinc-500">
                        Max 10 karakter, A–Z dan 0–9.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Branding: Logo preview */}
                {selectedIPAsset.imageUrl && (
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-sm font-medium uppercase tracking-wide">
                      Token Logo Preview
                    </Label>
                    <div className="flex items-center gap-4">
                      <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900/40">
                        <img
                          src={launchImageUrl || selectedIPAsset.imageUrl}
                          alt="Token logo preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                          }}
                        />
                        {launchLogoFile && (
                          <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-sovry-green/90 rounded text-[10px] text-black font-medium">
                            Custom
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500">
                        Using image from Story Protocol. You can override with a custom image below if needed.
                      </p>
                    </div>
                  </div>
                )}

                {/* Branding: Custom logo + description */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-sm font-medium uppercase tracking-wide">
                      Custom Logo (optional override)
                    </Label>
                    <FileUpload
                      accept="image/*"
                      multiple={false}
                      onChange={(files) => {
                        const file = files?.[0] || null;
                        handleLogoFileChange(file);
                      }}
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
                    <Label className="text-zinc-400 text-sm font-medium uppercase tracking-wide">
                      Token Description (optional)
                    </Label>
                    <Input
                      value={launchDescription}
                      onChange={(e) => setLaunchDescription(e.target.value)}
                      placeholder="Short description for this wrapped IP token"
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
                    />
                  </div>
                </div>

                {/* Social links */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-zinc-500 text-xs font-medium uppercase tracking-wide">
                      Twitter
                    </Label>
                    <Input
                      value={twitterUrl}
                      onChange={(e) => setTwitterUrl(e.target.value)}
                      placeholder="https://twitter.com/username"
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs sm:text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-500 text-xs font-medium uppercase tracking-wide">
                      Telegram
                    </Label>
                    <Input
                      value={telegramUrl}
                      onChange={(e) => setTelegramUrl(e.target.value)}
                      placeholder="https://t.me/channel"
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs sm:text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-500 text-xs font-medium uppercase tracking-wide">
                      Website
                    </Label>
                    <Input
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://project.site"
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs sm:text-sm"
                    />
                  </div>
                </div>

                {/* Launch Parameters */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-zinc-400">
                    <span>Percentage to Launch</span>
                    <span className="font-medium text-zinc-50">{launchPercentage}%</span>
                  </div>
                  <Slider
                    value={[launchPercentage]}
                    min={10}
                    max={100}
                    step={1}
                    onValueChange={(v) => {
                      const next = v[0] ?? 10;
                      setLaunchPercentage(next < 10 ? 10 : next);
                    }}
                  />
                  <p className="text-xs text-zinc-500">
                    You are selling {launchPercentage}% of total RT supply. You keep {100 - launchPercentage}% in your
                    wallet.
                  </p>
                </div>

                {/* Unlock notice + button */}
                {needsUnlock && (
                  <div className="space-y-4">
                    <div className="p-4 bg-zinc-800/30 border border-zinc-700/70 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Coins className="h-5 w-5 text-zinc-200" />
                        <div>
                          <p className="text-sm font-medium text-zinc-100">Royalty Tokens Required</p>
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

                    {/* Mini status list for unlock flow */}
                    <div className="space-y-1 text-[11px] text-zinc-500">
                      <div className="flex items-center gap-2">
                        {mintStatus === "pending" ? (
                          <Loader2 className="h-3 w-3 animate-spin text-sovry-green" />
                        ) : mintStatus === "success" ? (
                          <CheckCircle className="h-3 w-3 text-sovry-green" />
                        ) : mintStatus === "error" ? (
                          <AlertCircle className="h-3 w-3 text-amber-400" />
                        ) : (
                          <span className="h-2 w-2 rounded-full border border-zinc-500" />
                        )}
                        <span>Mint License Token</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {transferStatus === "pending" ? (
                          <Loader2 className="h-3 w-3 animate-spin text-sovry-green" />
                        ) : transferStatus === "success" ? (
                          <CheckCircle className="h-3 w-3 text-sovry-green" />
                        ) : transferStatus === "error" ? (
                          <AlertCircle className="h-3 w-3 text-amber-400" />
                        ) : (
                          <span className="h-2 w-2 rounded-full border border-zinc-500" />
                        )}
                        <span>Transfer Royalty Tokens</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {claimStatus === "pending" ? (
                          <Loader2 className="h-3 w-3 animate-spin text-sovry-green" />
                        ) : claimStatus === "success" ? (
                          <CheckCircle className="h-3 w-3 text-sovry-green" />
                        ) : claimStatus === "error" ? (
                          <AlertCircle className="h-3 w-3 text-amber-400" />
                        ) : (
                          <span className="h-2 w-2 rounded-full border border-zinc-500" />
                        )}
                        <span>Claim Revenue (optional)</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Launch button */}
                <Button
                  onClick={() => handleCreatePool(selectedIPAsset)}
                  disabled={
                    creatingPool === selectedIPAsset.ipId ||
                    needsUnlock ||
                    !tokenName.trim() ||
                    !tokenSymbolLaunch.trim()
                  }
                  variant="default"
                  className="w-full"
                >
                  {creatingPool === selectedIPAsset.ipId ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Launching...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="mr-2 h-4 w-4" />
                      Launch on Bonding Curve
                    </>
                  )}
                </Button>
                {/* Concise launch status */}
                <div className="mt-3 text-xs text-zinc-500 text-center">
                  {creatingPool === selectedIPAsset.ipId
                    ? "Launching... this may take a few moments."
                    : needsUnlock
                    ? "Unlock royalty tokens first, then you can launch."
                    : "Ready to launch. Review details above, then confirm when you're ready."}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl text-center text-sm text-zinc-400">
            Select an IP asset above to launch it on SovryLaunchpad.
          </div>
        )}
      </div>

      {/* Register IP Link */}
      <div className="mt-8 text-center">
        <Link
          href="https://story.foundation/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sovry-green hover:text-sovry-green/80 hover:underline transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Don't see your IP? Register an IP now.</span>
        </Link>
      </div>

      {/* Post-launch modal */}
      {showLaunchModal && launchedTokenAddress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-2xl bg-zinc-950 border border-zinc-800 p-6 shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-50">Launch Successful</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Your token has been launched on Sovry. You can now view the live pool or inspect it on StoryScan.
                </p>
              </div>
              <button
                className="text-zinc-500 hover:text-zinc-300 text-xs"
                onClick={() => setShowLaunchModal(false)}
              >
                Close
              </button>
            </div>

            <div className="space-y-3 mb-4 text-xs text-zinc-400">
              <div>
                <span className="font-medium text-zinc-200">Token:</span>{" "}
                <span>{launchedTokenSymbol || "Token"}</span>
              </div>
              <div className="break-all">
                <span className="font-medium text-zinc-200">Address:</span>{" "}
                <span>{launchedTokenAddress}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                className="flex-1 justify-center"
                variant="default"
                onClick={() => {
                  setShowLaunchModal(false);
                  router.push(`/pool/${launchedTokenAddress}`);
                }}
              >
                View Pool on Sovry
              </Button>
              <Button
                className="flex-1 justify-center"
                variant="outline"
                onClick={() => {
                  const url = `https://aeneid.storyscan.io/address/${launchedTokenAddress}`;
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                Open on StoryScan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
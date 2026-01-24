"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileUpload } from "@/components/ui/file-upload";
import toast from "react-hot-toast";

import {
  Loader2,
  AlertCircle,
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
  SOVRY_EXCHANGE_ADDRESS,
} from "@/services/storyProtocolService";
import { transferRoyaltyTokensFromIP } from "@/services/storyProtocolRegistration";

import { pinFileToIPFS, pinJSONToIPFS } from "@/services/pinataService";
import { supabase } from "@/lib/supabaseClient";
import { logger } from "@/lib/logger";
import { truncateAddress } from "@/lib/utils";

export default function CreatePage() {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext();
  const router = useRouter();

  const externalImageLoader = ({ src }: { src: string }) => src;

  const isConnected = !!primaryWallet;
  const walletAddress = primaryWallet?.address;

  const [ipAssets, setIpAssets] = useState<IPAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingPool, setCreatingPool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);
  const [selectedIP, setSelectedIP] = useState<string>("");
  const [tokenBalances, setTokenBalances] = useState<Record<string, TokenBalance>>({});
  const [unlockingTokens, setUnlockingTokens] = useState<string | null>(null);
  const [mintStatus, setMintStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [transferStatus, setTransferStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbolLaunch, setTokenSymbolLaunch] = useState("");
  const [launchImageUrl, setLaunchImageUrl] = useState("");
  const [launchDescription, setLaunchDescription] = useState("");
  const [launchPercentage, setLaunchPercentage] = useState<number>(100);
  const [launchLogoFile, setLaunchLogoFile] = useState<File | null>(null);
  const [twitterUrl, setTwitterUrl] = useState("");
  const [telegramUrl, setTelegramUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [launchedTokenAddress, setLaunchedTokenAddress] = useState<string | null>(null);
  const [launchedTokenSymbol, setLaunchedTokenSymbol] = useState<string | null>(null);

  const [assetsPage, setAssetsPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  const displayIPAssets = ipAssets;
  const totalAssets = displayIPAssets.length;

  useEffect(() => {
    const updatePageSize = () => {
      if (typeof window === "undefined") return;
      if (window.innerWidth < 768) {
        setPageSize(6); // 3 rows x 2 columns on mobile
      } else {
        setPageSize(20); // up to 20 IPs per page on desktop
      }
    };

    updatePageSize();
    window.addEventListener("resize", updatePageSize);
    return () => window.removeEventListener("resize", updatePageSize);
  }, []);

  const totalPages = totalAssets > 0 ? Math.ceil(totalAssets / pageSize) : 1;
  const currentPage = Math.min(assetsPage, totalPages);
  const paginatedAssets = displayIPAssets.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const handleLogoFileChange = (file: File | null) => {
    setLaunchLogoFile(file);
  };

  // Handle IP pre-selection from URL params (for Remix functionality)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const ipIdParam = params.get("ipId");

    if (ipIdParam && ipAssets.length > 0) {
      const matchingAsset = ipAssets.find(
        (asset) => asset.ipId.toLowerCase() === ipIdParam.toLowerCase(),
      );
      if (matchingAsset) {
        setSelectedIP(matchingAsset.ipId);
      }
    }
  }, [ipAssets]);

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

        const balanceResults = await Promise.all(
          assets.map(async (asset) => {
            if (!asset.royaltyVaultAddress) {
              return { ipId: asset.ipId, balance: null as TokenBalance | null };
            }
            try {
              const balance = await getTokenBalance(walletAddress, asset.royaltyVaultAddress);
              return { ipId: asset.ipId, balance };
            } catch {
              return { ipId: asset.ipId, balance: null };
            }
          })
        );

        const balances: Record<string, TokenBalance> = {};
        for (const { ipId, balance } of balanceResults) {
          if (balance) {
            balances[ipId] = balance;
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
    setMintStatus("pending");
    setTransferStatus("pending");

    try {
      // Only transfer Royalty Tokens from the IP Account to the wallet.
      // License and royalty vault are already configured for this IP.
      const transferResult = await transferRoyaltyTokensFromIP(ipAsset.ipId, primaryWallet);

      if (transferResult.success) {
        setMintStatus("success");
        setTransferStatus("success");
        toast.success("Royalty tokens transferred to your wallet", {
          duration: 3500,
        });

        // Refresh on-chain royalty token balance for this IP and update local state
        try {
          const updatedBalance = await getTokenBalance(walletAddress, ipAsset.royaltyVaultAddress);
          if (updatedBalance) {
            setTokenBalances((prev) => ({
              ...prev,
              [ipAsset.ipId]: updatedBalance,
            }));
          }
        } catch (balanceError) {
          logger.error("Failed to refresh royalty token balance after transfer", balanceError);
        }
      } else {
        setMintStatus("error");
        setTransferStatus("error");
        toast.error("Royalty token transfer failed", {
          duration: 4000,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get royalty tokens";
      setError(message);
      setMintStatus("error");
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

      const { launchpadService } = await import("@/services/launchpadService");

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

      try {
        // Always upload image to Pinata: prefer manual upload, otherwise fetch from Story/IP asset URL and re-upload
        let imageUrl = "";
        if (launchLogoFile) {
          // Manual upload takes precedence
          const imageRes = await pinFileToIPFS(launchLogoFile, launchLogoFile.name);
          imageUrl = imageRes.gatewayUrl;
        } else {
          const sourceUrl = launchImageUrl.trim() || ipAsset.imageUrl || "";
          if (sourceUrl) {
            try {
              const response = await fetch(sourceUrl);
              if (!response.ok) {
                throw new Error(`Failed to fetch image from source URL: ${response.status}`);
              }
              const blob = await response.blob();
              const baseName =
                launchImageUrl.trim() ||
                ipAsset.name ||
                symbolForLaunch ||
                nameForLaunch ||
                "image";
              const safeName = baseName.replace(/[^A-Za-z0-9-_]/g, "_");
              const fileName = `${safeName || "image"}.png`;
              const imageRes = await pinFileToIPFS(blob, fileName);
              imageUrl = imageRes.gatewayUrl;
            } catch (imageError) {
              logger.error("Failed to re-upload image to Pinata from source URL", imageError);
              // Fallback: keep using original source URL so launch can still proceed
              imageUrl = sourceUrl;
            }
          }
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

        await pinJSONToIPFS(
          metadata,
          `${symbolForLaunch || nameForLaunch}-wrapper`
        );

        if (supabase) {
          await supabase.from("launches").insert({
            royalty_token_address: ipAsset.royaltyVaultAddress.toLowerCase(),
            creator_address: walletAddress?.toLowerCase() || null,
            ip_id: ipAsset.ipId, // backing IP Account on Story
            name: nameForLaunch,
            symbol: symbolForLaunch,
            description: launchDescription || null,
            image_url: imageUrl || null,
            twitter_url: twitterUrl.trim() || null,
            telegram_url: telegramUrl.trim() || null,
            website_url: websiteUrl.trim() || null,
            metadata_uri: ipAsset.metadataUri || null,
          });
        }
      } catch (metaError) {
        logger.error("Failed to persist wrapper metadata", metaError);
      }

      setSuccess(
        `Launch Successful` +
          `\n• Approve Tx: ${result.approveTxHash}` +
          `\n• Launch Tx: ${result.launchTxHash}` +
          `\n• Exchange: ${SOVRY_EXCHANGE_ADDRESS.slice(0, 10)}...`
      );

      setTwitterUrl("");
      setTelegramUrl("");
      setWebsiteUrl("");
      setSelectedIP("");

      // Open post-launch modal with links
      // Prefer the newly created Sovry wrapper token address for pools; fall back to royalty vault on failure
      setLaunchedTokenAddress(result.wrapperAddress || ipAsset.royaltyVaultAddress);
      setLaunchedTokenSymbol(symbolForLaunch);
      setShowLaunchModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch on bonding curve");
    } finally {
      setCreatingPool(null);
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

  const signalStatus = isStep3Done
    ? "READY"
    : isStep3InProgress
      ? "LAUNCHING"
      : isStep2Done
        ? "ARMED"
        : isStep2InProgress
          ? "MINTING"
          : isStep1Done
            ? "AWAITING"
            : "IDLE";

  const previewName = tokenName || selectedIPAsset?.name || "Untitled IP";
  const previewSymbol =
    tokenSymbolLaunch ||
    (selectedIPAsset?.name ? selectedIPAsset.name.slice(0, 4).toUpperCase() : "") ||
    "IPTK";
  const previewImage = launchImageUrl || selectedIPAsset?.imageUrl || "";
  const vaultAddressLabel = selectedIPAsset?.royaltyVaultAddress
    ? truncateAddress(selectedIPAsset.royaltyVaultAddress, {
        start: 6,
        end: 4,
        separator: "…",
        minLength: 12,
      })
    : "—";
  const ipIdLabel = selectedIPAsset?.ipId
    ? truncateAddress(selectedIPAsset.ipId, {
        start: 6,
        end: 4,
        separator: "…",
        minLength: 12,
      })
    : "—";
  const signalTone =
    signalStatus === "READY" || signalStatus === "ARMED"
      ? "text-primary"
      : signalStatus === "LAUNCHING" || signalStatus === "MINTING"
        ? "text-secondary"
        : "text-muted-foreground";
  const creatorLabel = walletAddress
    ? truncateAddress(walletAddress, {
        start: 6,
        end: 4,
        separator: "…",
        minLength: 12,
      })
    : "—";
  const inputClassName =
    "h-11 bg-[#050505] border-[#262626] focus-visible:ring-primary focus-visible:border-primary/80 text-sm";
  const inputClassNameSm =
    "h-10 bg-[#050505] border-[#262626] focus-visible:ring-primary focus-visible:border-primary/80 text-[11px] sm:text-sm";

  const normalizeTwitterUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const username = trimmed
      .replace(/^https?:\/\/(www\.)?twitter\.com\//i, "")
      .replace(/^@/, "");

    return `https://twitter.com/${username}`;
  };

  const normalizeTelegramUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const handle = trimmed
      .replace(/^https?:\/\/(www\.)?t\.me\//i, "")
      .replace(/^@/, "");

    return `https://t.me/${handle}`;
  };

  const normalizeWebsiteUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    return `https://${trimmed.replace(/^https?:\/\//i, "")}`;
  };

  return (
    <div className="min-h-screen bg-background px-4 md:px-6 lg:px-8 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] border border-[#262626] bg-[#0A0A0A]">
          <aside className="border-b lg:border-b-0 lg:border-r border-[#262626] bg-[#060606] px-4 sm:px-6 py-6 lg:sticky lg:top-24 lg:self-start lg:h-[calc(100vh-7rem)] lg:overflow-y-auto">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                    Preview Blueprint
                  </p>
                  <span
                    className={`text-[11px] font-mono uppercase tracking-[0.3em] ${signalTone}`}
                  >
                    {signalStatus}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Raw wireframe of the Sovry wrapper token and Story IP asset payload.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                  Token Card
                </p>
                <div className="border border-[#262626] bg-[#050505]">
                  <div className="relative aspect-[4/3] border-b border-[#262626] bg-black flex items-center justify-center">
                    {previewImage ? (
                      <Image
                        loader={externalImageLoader}
                        unoptimized
                        src={previewImage}
                        alt={previewName}
                        fill
                        sizes="360px"
                        className="object-cover"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          target.style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">
                        NO SIGNAL
                      </span>
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                      <span>{previewSymbol}</span>
                      <span>{launchPercentage}%</span>
                    </div>
                    <div className="text-sm font-semibold text-foreground truncate">{previewName}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      Vault {vaultAddressLabel}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                  IP Asset
                </p>
                <div className="border border-[#262626] bg-[#050505]">
                  <div className="relative aspect-square border-b border-[#262626] bg-black flex items-center justify-center">
                    {selectedIPAsset?.imageUrl ? (
                      <Image
                        loader={externalImageLoader}
                        unoptimized
                        src={selectedIPAsset.imageUrl}
                        alt={selectedIPAsset.name || "IP asset"}
                        fill
                        sizes="360px"
                        className="object-cover"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          target.style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">
                        NO SIGNAL
                      </span>
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="text-[11px] font-semibold text-foreground truncate">
                      {selectedIPAsset?.name || "Unassigned IP"}
                    </div>
                    <div className="space-y-1 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>IP ID</span>
                        <span className="text-foreground tabular-nums">{ipIdLabel}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Creator</span>
                        <span className="text-foreground tabular-nums">{creatorLabel}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Media</span>
                        <span className="text-foreground">
                          {selectedIPAsset?.mediaType || "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                  Checklist
                </p>
                <div className="grid gap-2 text-[10px] font-mono uppercase tracking-[0.2em]">
                  <div className="flex items-center justify-between border border-[#262626] bg-[#050505] px-3 py-2">
                    <span>1. IP Selected</span>
                    <span className={isStep1Done ? "text-primary" : "text-muted-foreground"}>
                      {isStep1Done ? "OK" : "WAIT"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border border-[#262626] bg-[#050505] px-3 py-2">
                    <span>2. Royalty Tokens</span>
                    <span
                      className={
                        isStep2Done
                          ? "text-primary"
                          : isStep2InProgress
                            ? "text-secondary"
                            : "text-muted-foreground"
                      }
                    >
                      {isStep2InProgress ? "MINTING" : isStep2Done ? "ARMED" : "LOCKED"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border border-[#262626] bg-[#050505] px-3 py-2">
                    <span>3. Launch</span>
                    <span
                      className={
                        isStep3Done
                          ? "text-primary"
                          : isStep3InProgress
                            ? "text-secondary"
                            : "text-muted-foreground"
                      }
                    >
                      {isStep3InProgress ? "LAUNCHING" : isStep3Done ? "LIVE" : "STANDBY"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
          <div className="bg-[#0A0A0A] px-4 sm:px-6 py-6 lg:px-8 lg:py-8 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            <div className="space-y-8">
              <header className="border border-[#262626] bg-[#050505] px-4 py-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                    Input Console
                  </span>
                  <span
                    className={`text-[11px] font-mono uppercase tracking-[0.3em] ${signalTone}`}
                  >
                    Signal {signalStatus}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                  <span>Specification Sheet</span>
                  <span>{selectedIPAsset ? "Asset Locked" : "Awaiting IP"}</span>
                </div>
              </header>

              {/* Connect wallet banner */}
              {!isConnected && (
                <div className="rounded-sm border border-[#262626] bg-[#050505] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-secondary mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Wallet not connected</p>
                      <p className="text-xs text-muted-foreground">
                        Connect your wallet to see your IP assets and launch tokens.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-[10px] font-mono uppercase tracking-[0.2em] border-[#262626]"
                    onClick={() => setShowAuthFlow?.(true)}
                  >
                    Connect Wallet
                  </Button>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mb-2">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                </div>
              )}

              <section className="border border-[#262626] bg-[#050505] p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                  <span>IP Assets</span>
                  <span>{totalAssets} total</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Browse and select an IP asset from your connected wallet to launch.
                </p>
                {loading ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Loading your IP assets...</span>
                  </div>
                ) : totalAssets === 0 ? (
                  <div className="rounded-sm border border-dashed border-[#262626] bg-[#0A0A0A] px-4 py-6 text-center space-y-3">
                    <p className="text-sm text-foreground font-semibold">No IP assets found in your connected wallet.</p>
                    <p className="text-xs text-muted-foreground">
                      Register an IP on Story Protocol to start launching tokens on Sovry.
                    </p>
                    <div className="flex justify-center">
                      <Link
                        href="https://story.foundation/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-sm border border-primary/40 bg-primary/10 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-primary hover:bg-primary/20 transition-colors"
                      >
                        <PlusCircle className="h-4 w-4" />
                        <span>Register IP on Story Protocol</span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 max-h-[480px] overflow-y-auto pr-1">
                      {paginatedAssets.map((ipAsset) => {
                        const tokenBalance = tokenBalances[ipAsset.ipId];
                        const hasTokens =
                          tokenBalance && Number(tokenBalance.balance) > 0.000001;
                        return (
                          <div
                            key={ipAsset.ipId}
                            className={`group overflow-hidden rounded-sm border border-[#262626] bg-[#050505] cursor-pointer transition-colors ${
                              selectedIP === ipAsset.ipId
                                ? "border-primary/60 bg-[#0f0f0f]"
                                : "hover:border-primary/50"
                            }`}
                            onClick={() => setSelectedIP(ipAsset.ipId)}
                          >
                            <div className="relative w-full aspect-square bg-black flex items-center justify-center">
                              {ipAsset.imageUrl ? (
                                <Image
                                  loader={externalImageLoader}
                                  unoptimized
                                  src={ipAsset.imageUrl}
                                  alt={ipAsset.name || "IP asset"}
                                  fill
                                  sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                                  className="absolute inset-0 w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.currentTarget as HTMLImageElement;
                                    target.style.display = "none";
                                  }}
                                />
                              ) : (
                                <span className="text-[9px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                                  NO SIGNAL
                                </span>
                              )}
                            </div>
                            <div className="p-2 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <h3 className="font-semibold text-foreground truncate text-[11px] md:text-sm">
                                    {ipAsset.name}
                                  </h3>
                                </div>
                                <span
                                  className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[8px] md:text-[10px] font-mono uppercase tracking-[0.2em] border ${
                                    hasTokens
                                      ? "bg-primary/10 text-primary border-primary/30"
                                      : "bg-transparent text-muted-foreground border-[#262626]"
                                  }`}
                                >
                                  {hasTokens ? "READY" : "LOCKED"}
                                </span>
                              </div>
                              {ipAsset.description && (
                                <p className="hidden md:block text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                                  {ipAsset.description}
                                </p>
                              )}
                              {tokenBalance && (
                                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground pt-0.5 md:pt-1">
                                  Balance {" "}
                                  <span className="text-foreground tabular-nums">
                                    {tokenBalance.balance}%
                                  </span>
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 text-[11px] text-muted-foreground">
                        <span>
                          Page {currentPage} of {totalPages} · Showing {paginatedAssets.length} of {totalAssets} IPs
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-[10px] font-mono uppercase tracking-[0.2em]"
                            disabled={currentPage === 1}
                            onClick={() => setAssetsPage((prev) => Math.max(1, prev - 1))}
                          >
                            Prev
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-[10px] font-mono uppercase tracking-[0.2em]"
                            disabled={currentPage === totalPages}
                            onClick={() => setAssetsPage((prev) => Math.min(totalPages, prev + 1))}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Selected IP + Launch */}
              {selectedIPAsset ? (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                          Selected IP &amp; Launch
                        </p>
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                        Detail Panel
                      </span>
                    </div>
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-muted-foreground/30 to-transparent" />
                  </div>

                  {/* Selected IP summary */}
                  <div className="p-4 md:p-5 rounded-sm border border-border bg-card/60">
                    <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">
                      Selected IP Asset
                    </h3>
                    <div className="flex items-start gap-4">
                      {selectedIPAsset.imageUrl && (
                        <div className="flex-shrink-0">
                          <Image
                            loader={externalImageLoader}
                            unoptimized
                            src={selectedIPAsset.imageUrl}
                            alt={selectedIPAsset.name || "Selected IP asset"}
                            width={96}
                            height={96}
                            className="w-24 h-24 rounded-sm object-cover border border-border"
                            onError={(e) => {
                              const target = e.currentTarget as HTMLImageElement;
                              target.style.display = "none";
                            }}
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm md:text-base font-semibold text-foreground">{selectedIPAsset.name}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          Royalty Token: {selectedIPAsset.royaltyVaultAddress.slice(0, 10)}...
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Media Type: {selectedIPAsset.mediaType || "Unknown"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Launch config */}
                  <div className="space-y-4">
                    <div className="p-4 md:p-5 rounded-sm border border-border bg-card/60 space-y-4">

                      {/* Token Basics */}
                      <div className="space-y-2">
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                          Token Basics
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                              Token Name
                            </Label>
                            <Input
                              value={tokenName}
                              onChange={(e) => setTokenName(e.target.value)}
                              placeholder={selectedIPAsset.name || "Super Meme"}
                              className={inputClassName}
                            />

                            <p className="text-[11px] text-muted-foreground">
                              May differ from the original IP name.
                            </p>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                              Token Symbol
                            </Label>
                            <Input
                              value={tokenSymbolLaunch}
                              onChange={(e) =>
                                setTokenSymbolLaunch(e.target.value.toUpperCase().slice(0, 10))
                              }
                              placeholder="MEME"
                              className={inputClassName}
                            />

                            <p className="text-[11px] text-muted-foreground">
                              Max 10 Character, A–Z and 0–9.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Branding: Logo preview */}
                      {selectedIPAsset.imageUrl && (
                        <div className="space-y-2">
                          <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                            Token Logo Preview
                          </Label>
                          <div className="flex items-center gap-4">
                            <div className="relative w-20 md:w-24 aspect-square rounded-sm overflow-hidden border border-border bg-muted/40">
                              <Image
                                loader={externalImageLoader}
                                unoptimized
                                src={launchImageUrl || selectedIPAsset.imageUrl}
                                alt="Token logo preview"
                                fill
                                sizes="96px"
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                              {launchLogoFile && (
                                <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-sm border border-primary/40 bg-primary text-[9px] font-mono uppercase tracking-[0.2em] text-primary-foreground">
                                  Custom
                                </div>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Using image from IP asset. You can override with a custom image below if needed.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Branding: Custom logo + description */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
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
                              className="text-[10px] font-mono uppercase tracking-[0.2em]"
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
                          <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                            Token Description (optional)
                          </Label>
                          <Input
                            value={launchDescription}
                            onChange={(e) => setLaunchDescription(e.target.value)}
                            placeholder="Short description for this wrapped IP token"
                            className={inputClassName}
                          />
                        </div>
                      </div>

                      {/* Social links */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                            Twitter
                          </Label>
                          <Input
                            value={twitterUrl}
                            onChange={(e) => setTwitterUrl(normalizeTwitterUrl(e.target.value))}
                            placeholder="https://twitter.com/username"
                            className={inputClassNameSm}
                          />

                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                            Telegram
                          </Label>
                          <Input
                            value={telegramUrl}
                            onChange={(e) => setTelegramUrl(normalizeTelegramUrl(e.target.value))}
                            placeholder="https://t.me/channel"
                            className={inputClassNameSm}
                          />

                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                            Website
                          </Label>
                          <Input
                            value={websiteUrl}
                            onChange={(e) => setWebsiteUrl(normalizeWebsiteUrl(e.target.value))}
                            placeholder="https://project.site"
                            className={inputClassNameSm}
                          />

                        </div>
                      </div>

                      {/* Launch Parameters */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                          <span>Percentage to Launch</span>
                          <span className="text-foreground tabular-nums">{launchPercentage}%</span>
                        </div>
                        <Slider
                          value={[launchPercentage]}
                          min={25}
                          max={100}
                          step={1}
                          onValueChange={(v) => {
                            const next = v[0] ?? 25;
                            setLaunchPercentage(next < 25 ? 25 : next);
                          }}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          You are selling {launchPercentage}% of total RT supply. You keep {100 - launchPercentage}% in your
                          wallet.
                        </p>
                      </div>

                      {/* Unlock notice + button */}
                      {needsUnlock && (
                        <div className="space-y-4">
                          <div className="p-4 bg-muted/30 border border-border rounded-sm">
                            <div className="flex items-center space-x-3">
                              <Coins className="h-5 w-5 text-primary" />
                              <div>
                                <p className="text-sm font-semibold text-foreground">Royalty Tokens Required</p>
                                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
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
                            className="w-full h-12 text-[10px] font-mono uppercase tracking-[0.2em]"
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
                          <div className="space-y-1 text-[11px] text-muted-foreground">
                            <div className="flex items-center gap-2">
                              {mintStatus === "pending" ? (
                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                              ) : mintStatus === "success" ? (
                                <CheckCircle className="h-3 w-3 text-primary" />
                              ) : mintStatus === "error" ? (
                                <AlertCircle className="h-3 w-3 text-amber-400" />
                              ) : (
                                <span className="h-2 w-2 rounded-full border border-border" />
                              )}
                              <span>Mint License Token</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {transferStatus === "pending" ? (
                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                              ) : transferStatus === "success" ? (
                                <CheckCircle className="h-3 w-3 text-primary" />
                              ) : transferStatus === "error" ? (
                                <AlertCircle className="h-3 w-3 text-amber-400" />
                              ) : (
                                <span className="h-2 w-2 rounded-full border border-border" />
                              )}
                              <span>Transfer Royalty Tokens</span>
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
                        className="w-full h-12 text-[10px] font-mono uppercase tracking-[0.2em]"
                      >
                        {creatingPool === selectedIPAsset.ipId ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Launching...
                          </>
                        ) : (
                          <>
                            <TrendingUp className="mr-2 h-4 w-4" />
                            Launch on Sovry
                          </>
                        )}
                      </Button>
                      {/* Concise launch status */}
                      <div className="mt-3 text-[11px] text-muted-foreground text-center">
                        {creatingPool === selectedIPAsset.ipId
                          ? "Launching... this may take a few moments."
                          : needsUnlock
                          ? "Unlock royalty tokens first, then you can launch."
                          : "Ready to launch. Review details above, then confirm when you're ready."}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-muted/30 border border-border rounded-sm text-center text-sm text-muted-foreground">
                    Select an IP asset above to launch it on SovryLaunchpad.
                  </div>
                )}

              </div>

              {/* Register IP Link */}
              <div className="mt-8 text-center">
                <Link
                  href="https://portal.story.foundation/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-sm border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-primary hover:bg-primary/20 transition-colors"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Do not see your IP? Register an IP now.</span>
                </Link>
              </div>

              {/* Post-launch modal */}
              {showLaunchModal && launchedTokenAddress && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                  <div className="w-full max-w-md rounded-sm bg-card border border-border p-6 shadow-xl">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">Launch Successful</h2>
                        <p className="text-xs text-muted-foreground mt-1">
                          Your token has been launched on Sovry. You can now view the live pool or inspect it on StoryScan.
                        </p>
                      </div>
                      <button
                        className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
                        onClick={() => setShowLaunchModal(false)}
                      >
                        Close
                      </button>
                    </div>

                    <div className="space-y-3 mb-4 text-[11px] text-muted-foreground">
                      <div>
                        <span className="font-mono uppercase tracking-[0.2em] text-foreground">Token:</span>{" "}
                        <span>{launchedTokenSymbol || "Token"}</span>
                      </div>
                      <div className="break-all tabular-nums">
                        <span className="font-mono uppercase tracking-[0.2em] text-foreground">Address:</span>{" "}
                        <span>{launchedTokenAddress}</span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        className="flex-1 justify-center h-11 text-[10px] font-mono uppercase tracking-[0.2em]"
                        variant="default"
                        onClick={() => {
                          setShowLaunchModal(false);
                          router.push(`/pool/${launchedTokenAddress}`);
                        }}
                      >
                        Trade on Sovry
                      </Button>
                      <Button
                        className="flex-1 justify-center h-11 text-[10px] font-mono uppercase tracking-[0.2em]"
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
          </div>
        </div>
      </div>
    </div>
  );
}
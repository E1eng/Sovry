"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { parseEther } from "viem"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import { AlertCircle, CheckCircle, Copy, Loader2, Rocket, Terminal } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getLaunchpadAddress } from "@/lib/env"
import { cn, truncateAddress } from "@/lib/utils"

const factoryAbi = [
  {
    type: "function",
    name: "launchToken",
    stateMutability: "payable",
    inputs: [
      { name: "rtAddress", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "ipAsset", type: "address" },
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
    ],
    outputs: [{ name: "wrapperAddress", type: "address" }],
  },
] as const

const formSchema = z.object({
  rtAddress: z.string().min(1, "Required"),
  amount: z
    .string()
    .min(1, "Required")
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, "Must be numeric"),
  ipAsset: z.string().min(1, "Required"),
  name: z.string().min(1, "Required"),
  symbol: z.string().min(1, "Required"),
})

type FormValues = z.infer<typeof formSchema>

const mockCid = "ipfs://bafybeigdummyhash1234567890"

export default function CreatePage() {
  const router = useRouter()
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const isConnected = !!primaryWallet

  const [txHash, setTxHash] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)

  const launchpadAddress = useMemo(() => getLaunchpadAddress(), [])

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      rtAddress: "",
      amount: "1000000",
      ipAsset: "",
      name: "",
      symbol: "",
    },
  })

  const { writeContract, isPending } = useWriteContract()
  const { data: receipt, isLoading: isWaiting } = useWaitForTransactionReceipt({ hash: txHash })

  const onSubmit = async (values: FormValues) => {
    if (!isConnected || !primaryWallet) {
      setShowAuthFlow?.(true)
      return
    }
    setError(null)
    try {
      const amountWei = parseEther(values.amount)

      writeContract(
        {
          address: launchpadAddress,
          abi: factoryAbi,
          functionName: "launchToken",
          args: [values.rtAddress, amountWei, values.ipAsset, values.name, values.symbol],
          value: 0n,
        },
        {
          onSuccess: (hash) => setTxHash(hash),
          onError: (err) => setError(err.message || "Transaction failed"),
        }
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid amount")
    }
  }

  const txSuccess = receipt?.status === "success"

  useEffect(() => {
    if (txSuccess) {
      router.push("/profile")
    }
  }, [txSuccess, router])

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/50 bg-primary/10">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Sovry Factory</p>
              <h1 className="text-xl font-semibold">Launch Token</h1>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            launchToken(rtAddress, amount, ipAsset, name, symbol). Metadata is mocked locally.
          </p>
        </header>

        {!isConnected && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Connect your wallet to proceed.</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {txHash && (
          <Card className="border border-primary/40 bg-primary/5 p-4 text-xs font-mono">
            <div className="flex items-center gap-2 text-primary">
              <Terminal className="h-4 w-4" />
              <span>Transaction</span>
            </div>
            <div className="mt-2 break-all text-foreground">{txHash}</div>
            {isWaiting && (
              <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting for confirmation...
              </div>
            )}
            {txSuccess && (
              <div className="mt-2 flex items-center gap-2 text-green-400">
                <CheckCircle className="h-4 w-4" />
                Confirmed. Wrapper will appear after indexing.
              </div>
            )}
          </Card>
        )}

        <Card className="border border-[#262626] bg-[#0B0B0B] p-5 shadow-lg shadow-primary/10">
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rtAddress">Royalty Token Address</Label>
                <Input
                  id="rtAddress"
                  placeholder="0x..."
                  {...form.register("rtAddress")}
                  className="bg-black/60"
                />
                {form.formState.errors.rtAddress && (
                  <p className="text-xs text-red-400">{form.formState.errors.rtAddress.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ipAsset">IP Asset Address</Label>
                <Input
                  id="ipAsset"
                  placeholder="0x..."
                  {...form.register("ipAsset")}
                  className="bg-black/60"
                />
                {form.formState.errors.ipAsset && (
                  <p className="text-xs text-red-400">{form.formState.errors.ipAsset.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (uint256)</Label>
                <Input
                  id="amount"
                  placeholder="1000000"
                  {...form.register("amount")}
                  className="bg-black/60"
                />
                {form.formState.errors.amount && (
                  <p className="text-xs text-red-400">{form.formState.errors.amount.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Token Name</Label>
                <Input
                  id="name"
                  placeholder="My IP Token"
                  {...form.register("name")}
                  className="bg-black/60"
                />
                {form.formState.errors.name && (
                  <p className="text-xs text-red-400">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="symbol">Token Symbol</Label>
                <Input
                  id="symbol"
                  placeholder="IPT"
                  {...form.register("symbol")}
                  className="bg-black/60"
                />
                {form.formState.errors.symbol && (
                  <p className="text-xs text-red-400">{form.formState.errors.symbol.message}</p>
                )}
              </div>
            </div>
              {/* STEP 2: Token & Branding */}
              {currentStep === 2 && (
                <section className="space-y-4">
                  <div className="p-4 md:p-5 rounded-sm border border-border bg-card/60 space-y-4">
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                      <span>Token Basics</span>
                      <span className={canProceedStep2 ? "text-primary" : "text-muted-foreground"}>
                        {canProceedStep2 ? "Ready" : "Fill required"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                          Token Name
                        </Label>
                        <Input
                          value={tokenName}
                          onChange={(e) => setTokenName(e.target.value)}
                          placeholder={selectedIPAsset?.name || "Super Meme"}
                          className={inputClassName}
                        />
                        <p className="text-[11px] text-muted-foreground">May differ from the original IP name.</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                          Token Symbol
                        </Label>
                        <Input
                          value={tokenSymbolLaunch}
                          onChange={(e) => setTokenSymbolLaunch(e.target.value.toUpperCase().slice(0, 10))}
                          placeholder="MEME"
                          className={inputClassName}
                        />
                        <p className="text-[11px] text-muted-foreground">Max 10 Character, A–Z and 0–9.</p>
                      </div>
                    </div>

                    {selectedIPAsset?.imageUrl && (
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
                        You are selling {launchPercentage}% of total RT supply. You keep {100 - launchPercentage}% in your wallet.
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {/* STEP 3: Review & Launch */}
              {currentStep === 3 && (
                <section className="space-y-4">
                  {selectedIPAsset ? (
                    <div className="space-y-4">
                      <div className="p-4 md:p-5 rounded-sm border border-border bg-card/60">
                        <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">Selected IP Asset</h3>
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
                            <p className="text-[11px] text-muted-foreground">Media Type: {selectedIPAsset.mediaType || "Unknown"}</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 md:p-5 rounded-sm border border-border bg-card/60 space-y-4">
                        {needsUnlock && (
                          <div className="space-y-4">
                            <div className="p-4 bg-muted/30 border border-border rounded-sm">
                              <div className="flex items-center space-x-3">
                                <Coins className="h-5 w-5 text-primary" />
                                <div>
                                  <p className="text-sm font-semibold text-foreground">Royalty Tokens Required</p>
                                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                                    Get royalty tokens before launching. This will mint a license, deploy the vault, and transfer royalty tokens to your wallet.
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
                      Select an IP asset first, then continue.
                    </div>
                  )}
                </section>
              )}

              {/* Navigation controls */}
              <div className="flex items-center justify-between gap-3 border-t border-[#262626] pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] font-mono uppercase tracking-[0.2em] border-[#262626]"
                  onClick={goPrev}
                  disabled={currentStep === 1}
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  className="text-[10px] font-mono uppercase tracking-[0.2em]"
                  onClick={goNext}
                  disabled={(currentStep === 1 && !canProceedStep1) || (currentStep === 2 && !canProceedStep2) || currentStep === 3}
                >
                  {currentStep === 2 ? "Review" : currentStep === 1 ? "Next" : "Done"}
                </Button>
              </div>

              {/* Register IP Link */}
              <div className="text-center">
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
                          Your royalty token is live. Pool and vault addresses are below.
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[11px] font-mono uppercase tracking-[0.2em]"
                        onClick={() => setShowLaunchModal(false)}
                      >
                        Close
                      </Button>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Royalty Token</p>
                        <p className="text-foreground break-all">{launchedTokenAddress}</p>
                      </div>
                      {launchedTokenSymbol && (
                        <div>
                          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Symbol</p>
                          <p className="text-foreground">{launchedTokenSymbol}</p>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 justify-end">
                      <Button asChild size="sm" className="text-[11px] font-mono uppercase tracking-[0.2em]">
                        <Link href={`/pool/${launchedTokenAddress}`}>Open Pool</Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-[11px] font-mono uppercase tracking-[0.2em]"
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
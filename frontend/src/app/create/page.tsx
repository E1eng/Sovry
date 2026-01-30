"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { parseEther } from "viem"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import { AlertCircle, CheckCircle, Loader2, Rocket, Terminal } from "lucide-react"

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
    stateMutability: "nonpayable",
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
  ipAsset: z.string().min(1, "Required"),
  name: z.string().min(1, "Required"),
  symbol: z.string().min(1, "Required"),
})

type FormValues = z.infer<typeof formSchema>

const FIXED_RT_AMOUNT = "100"

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
      const amountWei = parseEther(FIXED_RT_AMOUNT)

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
            launchToken(rtAddress, {FIXED_RT_AMOUNT} RT, ipAsset, name, symbol). Metadata is mocked locally.
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div className="flex items-center justify-between border-t border-[#1f1f1f] pt-4">
              <div className="text-xs text-muted-foreground">Factory: {truncateAddress(launchpadAddress)}</div>
              <Button
                type="submit"
                disabled={isPending || isWaiting || !isConnected}
                className={cn(
                  "text-[11px] font-mono uppercase tracking-[0.3em]",
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                  "disabled:opacity-60"
                )}
              >
                {isPending || isWaiting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Launching
                  </span>
                ) : (
                  "Launch"
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
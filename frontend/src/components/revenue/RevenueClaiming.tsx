"use client";

import { useIsLoggedIn } from "@dynamic-labs/sdk-react-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function RevenueClaiming() {
  const isConnected = useIsLoggedIn();

  if (!isConnected) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="p-6 text-center">
          <p className="text-zinc-400">Please connect your wallet to view revenue tools.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>Revenue Claiming</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-zinc-300 leading-relaxed">
          Royalty revenue from your IP is currently harvested and applied via the
          <span className="font-semibold text-zinc-50"> Profile &gt; Launched Tokens &gt; Harvest </span>
          flow. This keeps all WIP movements on-chain between IP Accounts and the SovryLaunchpad,
          without routing tokens through your wallet.
        </p>

        <Alert className="border-sovry-green/30 bg-sovry-green/5">
          <AlertDescription className="text-sm text-zinc-200">
            A detailed revenue dashboard (with per-IP stats, history, and claim controls) will
            be added here in a future release. For now, please use the Harvest button on your
            Profile page.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

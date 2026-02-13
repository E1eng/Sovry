import { Metadata } from "next"
import { isAddress } from "viem"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>
}): Promise<Metadata> {
  const { address } = await params

  // Validate address format
  if (!address || !isAddress(address)) {
    return {
      title: "Invalid Token | Sovry",
      description: "Invalid token address on Sovry Launchpad",
    }
  }

  try {
    const { getLaunchInfo } = await import("@/services/launchpadService")
    const { supabase } = await import("@/lib/supabaseClient")

    const launchInfo = await getLaunchInfo(address)

    // Resolve name/symbol from Supabase tokens table
    let tokenName = "Token"
    let tokenSymbol = "TOKEN"
    if (supabase) {
      const { data } = await supabase
        .from("tokens")
        .select("name, symbol")
        .in("token_address", [address, address.toLowerCase()])
        .limit(1)
      if (Array.isArray(data) && data.length > 0) {
        tokenName = (data[0] as any).name || tokenName
        tokenSymbol = (data[0] as any).symbol || tokenSymbol
      }
    }

    const description = `${tokenName} (${tokenSymbol}) - IP Asset token on Sovry Launchpad`

    const isGraduated = launchInfo?.graduated || false
    const status = isGraduated ? "Graduated to PiperX" : "Active on Bonding Curve"

    return {
      title: `${tokenName} (${tokenSymbol}) - ${status} | Sovry`,
      description: `${description}. ${status}. View price chart, trading interface, and token information.`,
      openGraph: {
        title: `${tokenName} (${tokenSymbol}) - ${status}`,
        description: `${description}. ${status}.`,
        type: "website",
      },
      twitter: {
        card: "summary",
        title: `${tokenName} (${tokenSymbol}) - ${status}`,
        description: `${description}. ${status}.`,
      },
    }
  } catch {
    return {
      title: "Token Details | Sovry",
      description: "View token details on Sovry Launchpad",
    }
  }
}

export default function TokenDetailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}




import { Metadata } from "next"
import { getLaunchInfo } from "@/services/launchpadService"
import { enrichLaunchData } from "@/services/launchDataService"
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
    const [launchInfo, enrichedData] = await Promise.all([
      getLaunchInfo(address),
      enrichLaunchData(address),
    ])

    const tokenName = enrichedData.name || enrichedData.symbol || "Token"
    const tokenSymbol = enrichedData.symbol || "TOKEN"
    const description = enrichedData.category
      ? `${tokenName} (${tokenSymbol}) - ${enrichedData.category} token on Sovry Launchpad`
      : `${tokenName} (${tokenSymbol}) - Trade on Sovry Launchpad`

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
  } catch (error) {
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



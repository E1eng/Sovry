import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Sidebar } from "@/components/navigation/Sidebar";
import { StatusBar } from "@/components/navigation/StatusBar";
import { MobileNavBar } from "@/components/navigation/MobileNavBar";
import { DynamicWidget } from "@dynamic-labs/sdk-react-core";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sovry - Trade Token Backed IP Asset",
  description: "Trade Token Backed IP assets on Story Protocol",
  icons: {
    icon: "/Logo only no bg 1x1.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} overflow-x-hidden`}>
        <Providers>
          <div className="min-h-screen bg-zinc-950 flex overflow-x-hidden">
            <Sidebar />
            <main className="flex-1 pb-20 md:ml-16 md:pb-10 overflow-x-hidden">
              <div className="container mx-auto px-4 py-8 max-w-[1600px]">
                {children}
              </div>
            </main>
            <StatusBar />
          </div>
          <MobileNavBar />
          {/* Global wallet UI (Dynamic) */}
          <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
            <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
              <DynamicWidget variant="dropdown" />
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}

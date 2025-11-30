import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Sidebar } from "@/components/navigation/Sidebar";
import { StatusBar } from "@/components/navigation/StatusBar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sovry - IP Asset Trading Platform",
  description: "Trade intellectual property assets on Story Protocol",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-zinc-950 flex">
            <Sidebar />
            <main className="flex-1 ml-16 pb-10">
              <div className="container mx-auto px-4 py-8 max-w-7xl">
                {children}
              </div>
            </main>
            <StatusBar />
          </div>
        </Providers>
      </body>
    </html>
  );
}

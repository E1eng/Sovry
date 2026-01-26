import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { TopBar } from "@/components/navigation/TopBar";
import { StatusBar } from "@/components/navigation/StatusBar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Sovry - Bonding Curves for Story Protocol IP",
  description: "Launch bonding-curve IP tokens with royalty injection on Story Protocol",
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
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} overflow-x-hidden`}
      >
        <Providers>
          <div className="min-h-screen bg-background bg-[linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)] bg-[size:4rem_4rem] flex flex-col overflow-x-hidden">
            <TopBar />
            <main className="flex-1 pb-16 md:pb-12 overflow-x-hidden">
              <div className="w-full px-0 py-6 sm:py-8">{children}</div>
            </main>
            <StatusBar />
          </div>
        </Providers>
      </body>
    </html>
  );
}

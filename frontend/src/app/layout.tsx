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
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} overflow-x-hidden`}
      >
        <Providers>
          <div className="min-h-screen bg-background flex flex-col overflow-x-hidden">
            <TopBar />
            <main className="flex-1 pb-16 md:pb-12 overflow-x-hidden">
              <div className="w-full mx-auto px-0 sm:px-4 py-6 sm:py-8 max-w-[1600px]">
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

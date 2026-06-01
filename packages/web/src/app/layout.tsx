import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { cookieToInitialState } from "wagmi";
import Header from "@/components/Header";
import Web3Provider from "@/providers/Web3Provider";
import { wagmiConfig } from "@/chain/wagmiConfig";
import { NetworkProvider } from "@/contexts/NetworkContext";
import "./globals.css";

// Self-hosted fonts (sourced from @fontsource, copied to ./fonts) so the
// build/dev server never reaches out to Google Fonts — works fully offline.
const uiFont = localFont({
  src: [
    { path: "./fonts/ibm-plex-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-ui",
  display: "swap",
});

const monoFont = localFont({
  src: [
    { path: "./fonts/jetbrains-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/jetbrains-mono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "zkTLS C2C Exchange",
  description: "Semi-decentralized C2C exchange protocol powered by zkTLS",
};

// All pages are wallet- and contract-driven; static prerendering offers
// no benefit. Force dynamic rendering — the app is a server-rendered SPA.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialState = cookieToInitialState(
    wagmiConfig,
    cookies().get('wagmi.store')?.value,
  );
  return (
    <html lang="en">
      <body className={`${uiFont.variable} ${monoFont.variable} antialiased`}>
        <Web3Provider initialState={initialState}>
          <NetworkProvider>
            <Header />
            {children}
          </NetworkProvider>
        </Web3Provider>
      </body>
    </html>
  );
}

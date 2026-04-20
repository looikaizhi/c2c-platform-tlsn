import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono, Noto_Sans_SC } from "next/font/google";
import Header from "@/components/Header";
import AppQueryProvider from "@/providers/AppQueryProvider";
import "./globals.css";

const bodyFont = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const headingFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-heading",
  display: "swap",
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "zkTLS C2C Exchange",
  description: "Semi-decentralized C2C exchange protocol powered by zkTLS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${bodyFont.variable} ${headingFont.variable} ${monoFont.variable} antialiased`}
      >
        <AppQueryProvider>
          <Header />
          {children}
        </AppQueryProvider>
      </body>
    </html>
  );
}

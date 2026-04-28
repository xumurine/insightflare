import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";

import { GlobalScrollbars } from "@/components/global-scrollbars";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const appMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const DEMO_ANALYTICS_SCRIPT_SRC =
  "https://insight.ravelloh.com/script.js?siteId=04de9d96-fcec-41b1-b259-56e0dbaa2c5e";

export const metadata: Metadata = {
  title: "InsightFlare",
  description: "InsightFlare analytics dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-overlayscrollbars-initialize>
      <body
        className={`${appMono.variable} antialiased font-mono`}
        data-overlayscrollbars-initialize
      >
        <GlobalScrollbars />
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
        {process.env.NEXT_PUBLIC_DEMO_MODE === "1" ? (
          <script defer src={DEMO_ANALYTICS_SCRIPT_SRC} />
        ) : null}
      </body>
    </html>
  );
}

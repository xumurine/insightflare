import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";

import { GlobalScrollbars } from "@/components/global-scrollbars";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/constants";

import "./globals.css";

const appMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const DEMO_ANALYTICS_SCRIPT_SRC =
  "https://insight.ravelloh.com/script.js?siteId=04de9d96-fcec-41b1-b259-56e0dbaa2c5e";

const ESBUILD_NAME_HELPER_SCRIPT = `
(function () {
  if (typeof globalThis.__name !== "function") {
    globalThis.__name = function (target) {
      return target;
    };
  }
})();
`;

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s - ${APP_NAME}`,
  },
  description: `${APP_NAME} analytics dashboard`,
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
        <script
          dangerouslySetInnerHTML={{ __html: ESBUILD_NAME_HELPER_SCRIPT }}
        />
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

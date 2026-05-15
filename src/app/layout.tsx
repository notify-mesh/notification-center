import Script from "next/script";
import { DM_Mono } from "next/font/google";
import { cn } from "@root/lib/utils";
import { ThemeProvider } from "@root/components/theme/theme-provider";
import "@root/global.css";
import "@root/lib/orpc/server-client";
import type React from "react";

const dmMono = DM_Mono({
  weight: ["300", "400", "500"],
  display: "auto",
  adjustFontFallback: true,
  preload: true,
  subsets: ["latin"],
  variable: "--font-mono",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is required so next-themes' pre-hydration
    // script can swap the `class` on <html> before React reconciles without
    // tripping the dev-time hydration warning.
    <html className={cn("font-mono", dmMono.variable)} suppressHydrationWarning>
      <head>
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            async
            defer
            strategy="beforeInteractive"
            data-options={JSON.stringify({
              activationMode: "hold",
              keyHoldDuration: 150,
              allowActivationInsideInput: true,
              maxContextLines: 10,
              activationKey: "Meta+shift",
            })}
          />
        )}
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

import Script from "next/script";
import localFont from "next/font/local";
import { cn } from "@root/lib/utils";
import { ThemeProvider } from "@root/components/theme/theme-provider";
import "@root/global.css";
import "@root/lib/orpc/server-client";
import type React from "react";

/**
 * DM Mono shipped locally from `public/fonts/DM_Mono/`.
 *
 * We host the font ourselves instead of pulling from Google's CDN — keeps
 * the app working in air-gapped / restricted networks, eliminates a
 * third-party request, and means the same exact font byte-for-byte ships
 * in CI, dev, and prod.
 *
 * `next/font/local` hashes the files at build time and emits a CSS
 * `@font-face` block that resolves to a versioned URL, so cache-busting is
 * free across deploys.
 */
const dmMono = localFont({
  variable: "--font-mono",
  display: "swap",
  preload: true,
  src: [
    {
      path: "../../public/fonts/DM_Mono/DMMono-Light.ttf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../public/fonts/DM_Mono/DMMono-LightItalic.ttf",
      weight: "300",
      style: "italic",
    },
    {
      path: "../../public/fonts/DM_Mono/DMMono-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/DM_Mono/DMMono-Italic.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../public/fonts/DM_Mono/DMMono-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/DM_Mono/DMMono-MediumItalic.ttf",
      weight: "500",
      style: "italic",
    },
  ],
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

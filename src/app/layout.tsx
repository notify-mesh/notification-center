import Script from "next/script";
import { Geist } from "next/font/google";
import { cn } from "@root/lib/utils";
import "@root/lib/orpc.server";
import type React from "react";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={cn("font-sans", geist.variable)}>
      <head>
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
            data-options={JSON.stringify({
              activationMode: "hold",
              keyHoldDuration: 150,
              allowActivationInsideInput: true,
              maxContextLines: 10,
            })}
          />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}

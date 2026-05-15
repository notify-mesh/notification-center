"use client";

import * as React from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { cn } from "@root/lib/utils";

export interface QrCodeProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  size?: number;
  margin?: number;
  fg?: string;
  bg?: string;
  level?: "L" | "M" | "Q" | "H";
}

export function QrCode({
  value,
  size = 192,
  margin = 1,
  fg = "#000000",
  bg = "#ffffff",
  level = "M",
  className,
  ...rest
}: QrCodeProps) {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      errorCorrectionLevel: level,
      margin,
      width: size * 2, // 2x for crisp rendering on HiDPI displays
      color: { dark: fg, light: bg },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not render QR.");
      });
    return () => {
      cancelled = true;
    };
  }, [value, size, margin, fg, bg, level]);

  return (
    <div
      role="img"
      aria-label="Scannable QR code"
      className={cn(
        "inline-flex items-center justify-center rounded-md border bg-white p-2 shadow-sm",
        className,
      )}
      style={{ width: size + 16, height: size + 16 }}
      {...rest}
    >
      {error ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : dataUrl ? (
        <Image
          src={dataUrl}
          alt=""
          width={size}
          height={size}
          unoptimized
          priority
        />
      ) : (
        <div className="size-full animate-pulse rounded bg-muted" />
      )}
    </div>
  );
}

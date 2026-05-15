import type React from "react";
import { ThemeToggle } from "@root/components/theme/theme-toggle";

/**
 * Unauthenticated shell — full-bleed centered card. The `proxy.ts` middleware
 * allows anonymous traffic on this whole route group; pages under `(admin)/`
 * are protected instead.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-screen place-items-center bg-muted/30 px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle variant="outline" />
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

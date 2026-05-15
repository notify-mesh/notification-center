"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

/**
 * App-wide loading state.
 *
 * Renders a centred logo, an animated brand pulse, the **current page title
 * derived from `usePathname()`**, and three breathing dots. Pure CSS — no
 * hydration, no remote calls.
 *
 * Why `usePathname`? In the App Router, `loading.tsx` is mounted at the
 * Suspense boundary *before* the page resolves; we don't have the new
 * page's metadata yet. The pathname is, however, already the *target* URL
 * — so we map it to a friendly title manually and the user sees something
 * meaningful while the page hydrates.
 */
export function LoadingShell() {
  const pathname = usePathname();
  const title = titleForPathname(pathname);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading ${title}`}
      className="fixed inset-0 z-50 grid place-items-center bg-background"
    >
      {/* Soft brand vignette */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" />

      <div className="relative flex flex-col items-center gap-7">
        {/* Logo + concentric pings */}
        <div className="relative size-20">
          <span
            aria-hidden="true"
            className="absolute inset-0 animate-ping rounded-2xl bg-primary/20 [animation-duration:1.8s]"
          />
          <span
            aria-hidden="true"
            className="absolute inset-2 animate-ping rounded-xl bg-primary/30 [animation-delay:300ms] [animation-duration:1.8s]"
          />
          <div className="relative flex size-full items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 ring-1 ring-primary/10">
            <Bell className="size-9 drop-shadow-sm" />
          </div>
        </div>

        {/* Title + caption */}
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-base font-semibold tracking-tight text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">Notification Center</span>
        </div>

        {/* Breathing dots */}
        <div aria-hidden="true" className="flex items-center gap-1.5">
          <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/80 [animation-delay:-450ms] [animation-duration:1.4s]" />
          <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/80 [animation-delay:-225ms] [animation-duration:1.4s]" />
          <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/80 [animation-duration:1.4s]" />
        </div>
      </div>

      {/* Slim top progress bar */}
      <div
        aria-hidden="true"
        className="absolute top-0 right-0 left-0 h-0.5 overflow-hidden bg-muted/40"
      >
        <div className="h-full w-1/3 animate-pulse bg-gradient-to-r from-transparent via-primary to-transparent" />
      </div>
    </div>
  );
}

/**
 * Path → user-facing title. Matches the longest prefix so deeper routes
 * (`/projects/abc/environments/...`) resolve to "Project" rather than the
 * generic "Projects" listing.
 */
const TITLE_MAP: Array<[RegExp, string]> = [
  [/^\/dashboard/, "Dashboard"],
  [/^\/activity/, "Activity"],
  [/^\/organizations\/new/, "New organization"],
  [/^\/organizations/, "Organizations"],
  [/^\/teams/, "Teams"],
  [/^\/projects\/[^/]+/, "Project"],
  [/^\/projects/, "Projects"],
  [/^\/api-keys\/new/, "Issue API key"],
  [/^\/api-keys/, "API Keys"],
  [/^\/templates/, "Templates"],
  [/^\/send/, "Send notification"],
  [/^\/passkeys/, "Passkeys"],
  [/^\/devices/, "Devices"],
  [/^\/permissions/, "Permissions"],
  [/^\/notifications/, "Notification preferences"],
  [/^\/security/, "Security"],
  [/^\/account/, "Account"],
  [/^\/sign-in/, "Signing in"],
  [/^\/forgot-password/, "Reset password"],
  [/^\/reset-password/, "Reset password"],
];

function titleForPathname(pathname: string | null): string {
  if (!pathname) return "Loading";
  for (const [pattern, title] of TITLE_MAP) {
    if (pattern.test(pathname)) return title;
  }
  return "Loading";
}

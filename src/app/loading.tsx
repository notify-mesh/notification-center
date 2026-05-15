import { Bell } from "lucide-react";

/**
 * Global suspense boundary for the App Router.
 *
 * Streamed by Next.js whenever a route segment is fetching data. Pure CSS
 * animations (no client hydration) so it appears the instant the request
 * hits the server.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading the Notification Center"
      className="fixed inset-0 z-50 grid place-items-center bg-background"
    >
      {/* Subtle radial vignette so the central logo pops against flat bg. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,theme(colors.primary/8%)_0%,transparent_60%)]"
      />

      <div className="relative flex flex-col items-center gap-8">
        {/* Logo + concentric ping rings.
            Two ping layers at different inset/opacity/delay fake a ripple
            without writing custom keyframes. */}
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

        <div className="flex flex-col items-center gap-3">
          <span className="text-base font-semibold tracking-tight">
            Notification Center
          </span>

          {/* Three-dot indeterminate indicator.
              Staggered `animate-pulse` with negative delays creates a soft
              wave instead of a bouncy hop — quieter, more modern. */}
          <div aria-hidden="true" className="flex items-center gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/80 [animation-delay:-450ms] [animation-duration:1.4s]" />
            <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/80 [animation-delay:-225ms] [animation-duration:1.4s]" />
            <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/80 [animation-duration:1.4s]" />
          </div>

          <span className="text-xs text-muted-foreground">Loading…</span>
        </div>
      </div>

      {/* Sliding bar across the top — gives the page a "something is
          happening" anchor even on slow networks. Pure CSS via `animate-pulse`
          + a gradient track; no custom keyframes needed. */}
      <div
        aria-hidden="true"
        className="absolute top-0 right-0 left-0 h-0.5 overflow-hidden bg-muted/40"
      >
        <div className="h-full w-1/3 animate-pulse bg-gradient-to-r from-transparent via-primary to-transparent" />
      </div>
    </div>
  );
}

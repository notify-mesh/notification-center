import { Suspense } from "react";
import { LoadingShell } from "@root/components/layout/loading-shell";

/**
 * Global suspense fallback for the App Router.
 *
 * The visuals + page-title resolution live in `<LoadingShell>` (a client
 * component) because we read `usePathname()` to label the current page. A
 * thin Suspense wrap keeps the boundary boundary streamable.
 */
export default function Loading() {
  return (
    <Suspense fallback={null}>
      <LoadingShell />
    </Suspense>
  );
}

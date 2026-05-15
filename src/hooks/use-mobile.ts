"use client";

import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  // useSyncExternalStore is the right tool for media-query subscription:
  // no setState-in-effect, and the snapshot returns the SSR-safe `false` on
  // the server (since `matchMedia` is unavailable there).
  return React.useSyncExternalStore(
    (onStoreChange) => {
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
      mql.addEventListener("change", onStoreChange);
      return () => mql.removeEventListener("change", onStoreChange);
    },
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  );
}

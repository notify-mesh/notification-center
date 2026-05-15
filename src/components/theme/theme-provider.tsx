"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

/**
 * Theme provider for Light / Dark / System. Sits at the root of the app
 * tree (above `<body>`'s children). Matches the codebase's Tailwind v4
 * `.dark` class variant (defined as `@custom-variant dark (&:is(.dark *))`
 * in `global.css`).
 *
 * `next-themes` ships an inline pre-hydration script that flips the class
 * before React boots, eliminating the wrong-theme flash on first paint.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="nc-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

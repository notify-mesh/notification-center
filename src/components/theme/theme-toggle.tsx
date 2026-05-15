"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@root/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@root/components/ui/dropdown-menu";
import { cn } from "@root/lib/utils";

type ThemePreference = "light" | "dark" | "system";

const OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light", description: "Always light theme.", icon: Sun },
  { value: "dark", label: "Dark", description: "Always dark theme.", icon: Moon },
  {
    value: "system",
    label: "System",
    description: "Follow the OS preference.",
    icon: Monitor,
  },
];

export interface ThemeToggleProps {
  align?: "start" | "center" | "end";
  size?: "default" | "sm" | "icon";
  variant?: "ghost" | "outline";
  className?: string;
}

export function ThemeToggle({
  align = "end",
  size = "icon",
  variant = "ghost",
  className,
}: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  // Documented next-themes pattern for avoiding the SSR/CSR icon mismatch.
  // The setMounted-in-effect runs exactly once after first paint to flip the
  // initial neutral icon over to the real resolved-theme icon.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setMounted(true), []);

  // While SSR / before mount, render an icon that won't flicker — the inline
  // script has already applied the right class on <html>, but `useTheme`
  // is still defaulting until hydration completes.
  const active = (theme as ThemePreference | undefined) ?? "system";
  const ActiveIcon =
    !mounted || active === "system"
      ? resolvedTheme === "dark"
        ? Moon
        : Sun
      : active === "dark"
        ? Moon
        : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn("relative", className)}
          aria-label="Switch theme"
        >
          <ActiveIcon className="size-4" />
          {size !== "icon" ? <span className="ml-2">Theme</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = active === opt.value;
          return (
            <DropdownMenuItem
              key={opt.value}
              onSelect={() => setTheme(opt.value)}
              className="flex items-start gap-2"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium leading-none">{opt.label}</span>
                <span className="text-[11px] text-muted-foreground">{opt.description}</span>
              </div>
              {selected ? <Check className="ml-2 size-4 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

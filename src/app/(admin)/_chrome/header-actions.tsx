"use client";

import { Bell, Search } from "lucide-react";
import { Button } from "@root/components/ui/button";
import { Badge } from "@root/components/ui/badge";
import { useCommandPalette } from "@root/components/layout/command-palette";

export function HeaderActions({ email }: { email: string }) {
  const palette = useCommandPalette();

  return (
    <div className="flex flex-1 items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => palette.setOpen(true)}
        className="hidden h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-foreground sm:flex sm:w-72"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="pointer-events-none inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground select-none">
          ⌘K
        </kbd>
      </button>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          onClick={() => palette.setOpen(true)}
          aria-label="Search"
        >
          <Search className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          <Badge
            variant="default"
            className="absolute -top-1 -right-1 size-4 min-w-4 rounded-full p-0 text-[10px]"
          >
            3
          </Badge>
        </Button>
        <span className="hidden text-xs text-muted-foreground sm:inline">{email}</span>
      </div>
    </div>
  );
}

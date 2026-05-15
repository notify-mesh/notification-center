"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Search } from "lucide-react";
import { Button } from "@root/components/ui/button";
import { Badge } from "@root/components/ui/badge";
import { useCommandPalette } from "@root/components/layout/command-palette";
import { ThemeToggle } from "@root/components/theme/theme-toggle";
import { client } from "@root/lib/orpc/client";
import { useInternalNotifyStream } from "@root/lib/internal-notify/use-stream";

export function HeaderActions({ email }: { email: string }) {
  const palette = useCommandPalette();
  const queryClient = useQueryClient();

  // Unread count — polled as a backstop in case the SSE stream is closed
  // (mobile background tabs, transient network failures, …).
  const unreadQuery = useQuery({
    queryKey: ["internal-notify", "unread-count"],
    queryFn: async () => client.internalNotify.unreadCount({}),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Real-time push: invalidate the unread count any time the server emits.
  useInternalNotifyStream(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["internal-notify", "unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["internal-notify", "inbox"] });
    }, [queryClient]),
  );

  const count = unreadQuery.data?.count ?? 0;

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
        <ThemeToggle />
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications (${count} unread)`}
        >
          <Link href="/notifications">
            <Bell className="size-4" />
            {count > 0 ? (
              <Badge
                variant="default"
                className="absolute -top-1 -right-1 size-4 min-w-4 rounded-full p-0 text-[10px]"
              >
                {count > 99 ? "99+" : count}
              </Badge>
            ) : null}
          </Link>
        </Button>
        <span className="hidden text-xs text-muted-foreground sm:inline">{email}</span>
      </div>
    </div>
  );
}

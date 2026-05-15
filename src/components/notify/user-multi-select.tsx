"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search, Users, X } from "lucide-react";
import { client } from "@root/lib/orpc/client";
import { Avatar, AvatarFallback, AvatarImage } from "@root/components/ui/avatar";
import { Badge } from "@root/components/ui/badge";
import { Button } from "@root/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@root/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@root/components/ui/popover";
import { cn } from "@root/lib/utils";

export interface MiniUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  image: string | null;
  phoneNumber: string | null;
  organizationNames: string[];
}

export interface UserMultiSelectProps {
  /** Selected user ids. Controlled. */
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Cap selection — render the result row as disabled past this limit. */
  maxSelected?: number;
  className?: string;
}

/**
 * Search + multi-select combobox for picking notification recipients.
 *
 * The component caches a `MiniUser` map keyed by id so chips can render
 * rich content (avatar, name, email) without needing the parent to also
 * hydrate user objects. The map seeds itself from two sources:
 *   1. Search results streaming back from `internalNotify.searchUsers`
 *   2. An explicit "hydrate" pass — when the parent passes `value` ids the
 *      cache doesn't know about yet, we re-issue the search procedure with
 *      `includeIds` so the chips never render as raw ids.
 *
 * Search is debounced (220ms) so typing doesn't flood the RPC layer.
 */
export function UserMultiSelect({
  value,
  onChange,
  placeholder = "Search users by name, email, or phone…",
  maxSelected,
  className,
}: UserMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [rawQuery, setRawQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(rawQuery), 220);
    return () => clearTimeout(t);
  }, [rawQuery]);

  // The procedure includes selected ids in its response (via `includeIds`),
  // so we can derive the lookup map purely from the latest query data —
  // no accumulating effect needed.
  const sortedIncludeIds = React.useMemo(() => [...value].sort().join(","), [value]);
  const searchQuery = useQuery({
    queryKey: ["internal-notify", "search-users", debounced, sortedIncludeIds],
    queryFn: async () =>
      client.internalNotify.searchUsers({
        query: debounced,
        limit: 20,
        includeIds: value.length > 0 ? value : undefined,
      }),
  });

  const userMap = React.useMemo(() => {
    const m = new Map<string, MiniUser>();
    for (const u of searchQuery.data?.users ?? []) m.set(u.id, u);
    return m;
  }, [searchQuery.data]);

  const results = searchQuery.data?.users ?? [];
  const selectedSet = React.useMemo(() => new Set(value), [value]);
  const atCap = typeof maxSelected === "number" && value.length >= maxSelected;

  function toggleUser(id: string) {
    if (selectedSet.has(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      if (atCap) return;
      onChange([...value, id]);
    }
  }

  function removeUser(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  function clearAll() {
    onChange([]);
  }

  // Selected users in the order they were picked, hydrated via userMap.
  // When the procedure hasn't returned yet we render a "pending" chip.
  const selectedUsers: Array<MiniUser | { id: string; pending: true }> = value.map(
    (id) => userMap.get(id) ?? { id, pending: true },
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "h-auto min-h-10 w-full justify-between px-3 py-2",
              value.length > 0 ? "pl-1.5" : "",
            )}
          >
            <div className="flex flex-1 flex-wrap items-center gap-1">
              {value.length === 0 ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="size-3.5" />
                  {placeholder}
                </span>
              ) : (
                <>
                  {selectedUsers.slice(0, 4).map((u) =>
                    "pending" in u ? (
                      <Badge key={u.id} variant="secondary" className="font-mono text-[10px]">
                        {u.id.slice(0, 8)}…
                      </Badge>
                    ) : (
                      <Badge
                        key={u.id}
                        variant="secondary"
                        className="flex items-center gap-1 pr-1 text-xs"
                      >
                        <Avatar className="size-4">
                          {u.image ? <AvatarImage src={u.image} alt={u.name} /> : null}
                          <AvatarFallback className="text-[8px]">
                            {initials(u.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="max-w-[10rem] truncate">{u.name}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Remove ${u.name}`}
                          className="-mr-0.5 ml-1 rounded p-0.5 hover:bg-background"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeUser(u.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              removeUser(u.id);
                            }
                          }}
                        >
                          <X className="size-3" />
                        </span>
                      </Badge>
                    ),
                  )}
                  {value.length > 4 ? (
                    <Badge variant="outline" className="text-xs">
                      +{value.length - 4}
                    </Badge>
                  ) : null}
                </>
              )}
            </div>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-0"
          sideOffset={6}
        >
          <Command shouldFilter={false}>
            <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
              <Search className="mr-2 size-4 shrink-0 text-muted-foreground" />
              <CommandInput
                value={rawQuery}
                onValueChange={setRawQuery}
                placeholder="Type to search…"
                className="h-10 border-0 outline-none focus:ring-0"
              />
            </div>
            <CommandList className="max-h-72">
              {searchQuery.isLoading ? (
                <div className="px-4 py-3 text-xs text-muted-foreground">Searching…</div>
              ) : null}
              {results.length === 0 && !searchQuery.isLoading ? (
                <CommandEmpty>No users match &ldquo;{debounced || rawQuery}&rdquo;.</CommandEmpty>
              ) : null}
              {results.length > 0 ? (
                <CommandGroup heading={`${results.length} result${results.length === 1 ? "" : "s"}`}>
                  {results.map((u) => {
                    const checked = selectedSet.has(u.id);
                    const disabled = atCap && !checked;
                    return (
                      <CommandItem
                        key={u.id}
                        value={u.id}
                        disabled={disabled}
                        onSelect={() => toggleUser(u.id)}
                        className="flex items-center gap-2"
                      >
                        <Avatar className="size-7">
                          {u.image ? <AvatarImage src={u.image} alt={u.name} /> : null}
                          <AvatarFallback className="text-[10px]">
                            {initials(u.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{u.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {u.email}
                            {u.organizationNames.length > 0
                              ? ` · ${u.organizationNames.slice(0, 2).join(", ")}`
                              : ""}
                          </p>
                        </div>
                        <Check
                          className={cn(
                            "size-4 shrink-0 transition-opacity",
                            checked ? "opacity-100 text-primary" : "opacity-0",
                          )}
                        />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null}
            </CommandList>
            <div className="flex items-center justify-between border-t px-2 py-1.5 text-[11px] text-muted-foreground">
              <span>
                {value.length} selected
                {typeof maxSelected === "number" ? ` / ${maxSelected}` : ""}
              </span>
              {value.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px]"
                  onClick={clearAll}
                >
                  Clear all
                </Button>
              ) : null}
            </div>
          </Command>
        </PopoverContent>
      </Popover>
      {atCap ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Selection cap reached ({maxSelected}).
        </p>
      ) : null}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

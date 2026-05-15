"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Mail, Trash2 } from "lucide-react";
import { client } from "@root/lib/orpc/client";
import { Button } from "@root/components/ui/button";
import { Badge } from "@root/components/ui/badge";
import { Card, CardContent } from "@root/components/ui/card";
import { Skeleton } from "@root/components/ui/skeleton";

/**
 * Pending-invitations table. Embedded on both the Teams page (filtered by
 * `teamId`) and the Organizations / Permissions pages (org-wide). Each row
 * shows the invitee, role + team scope, who sent it, and an expiry hint.
 */
export function InvitationsList({ teamId }: { teamId?: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["invitations", teamId ?? "all", "pending"],
    queryFn: async () =>
      (await client.invitations.list({ status: "pending", teamId })).invitations,
  });

  const cancel = useMutation({
    mutationFn: async (invitationId: string) => client.invitations.cancel({ invitationId }),
    onSuccess: () => {
      toast.success("Invitation cancelled");
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (error)
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-destructive">{error.message}</CardContent>
      </Card>
    );

  const invitations = data ?? [];
  if (invitations.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <Mail className="size-4" />
          No pending invitations.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="px-0 pb-0">
        <ul className="divide-y">
          {invitations.map((inv) => {
            const expiresIn = formatExpiry(new Date(inv.expiresAt));
            return (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Mail className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{inv.email}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">
                      {inv.role ?? "member"}
                    </Badge>
                    {inv.teamId ? (
                      <Badge variant="secondary" className="text-[10px]">
                        team
                      </Badge>
                    ) : null}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" />
                      {expiresIn}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => cancel.mutate(inv.id)}
                  disabled={cancel.isPending}
                >
                  <Trash2 />
                  Cancel
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/** "Expires in 6 days" / "Expired" — short, no-deps relative formatter. */
function formatExpiry(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  if (diffMs < 0) return "Expired";
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days > 0) return `Expires in ${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours > 0) return `Expires in ${hours}h`;
  return "Expires in <1h";
}

"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { client } from "@root/lib/orpc/client";
import { Button } from "@root/components/ui/button";
import { Input } from "@root/components/ui/input";
import { Label } from "@root/components/ui/label";
import { Textarea } from "@root/components/ui/textarea";
import { Badge } from "@root/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@root/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@root/components/ui/dialog";

const ROLES = [
  { value: "owner", label: "Owner — full control" },
  { value: "admin", label: "Admin — manage org + members" },
  { value: "member", label: "Member — standard access" },
  { value: "developer", label: "Developer — build + ship" },
  { value: "viewer", label: "Viewer — read-only" },
] as const;

/**
 * Reusable invitation dialog.
 *
 * Accepts either an explicit `teamId` (binds invites to the team) or none
 * (org-wide invite). Emails are parsed permissively — comma / newline /
 * semicolon-separated. Each email becomes its own invitation row.
 */
export function InviteDialog({
  teamId,
  trigger,
  onCompleted,
}: {
  teamId?: string;
  trigger?: React.ReactNode;
  onCompleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [rawInput, setRawInput] = React.useState("");
  const [role, setRole] = React.useState<(typeof ROLES)[number]["value"]>("member");

  // Parsed-on-the-fly so the UI shows the chip list as the user types.
  const emails = React.useMemo(() => extractEmails(rawInput), [rawInput]);

  const send = useMutation({
    mutationFn: async () =>
      client.invitations.send({
        emails,
        role,
        teamId,
      }),
    onSuccess: (result) => {
      const skipped = result.skipped.length;
      const created = result.created.length;
      if (created > 0 && skipped === 0) {
        toast.success(`Invited ${created} ${created === 1 ? "user" : "users"}`);
      } else if (created > 0 && skipped > 0) {
        toast.warning(`Invited ${created} · ${skipped} skipped`, {
          description: result.skipped.map((s) => `${s.email}: ${s.reason}`).join("\n"),
        });
      } else if (skipped > 0) {
        toast.error("No invitations sent", {
          description: result.skipped.map((s) => `${s.email}: ${s.reason}`).join("\n"),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      onCompleted?.();
      if (created > 0) {
        setRawInput("");
        setOpen(false);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus />
            Invite users
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite teammates</DialogTitle>
          <DialogDescription>
            {teamId ? (
              <>One or more email addresses. New members join this team on accept.</>
            ) : (
              <>One or more email addresses. New members join the active organization.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-emails">Emails</Label>
            <Textarea
              id="invite-emails"
              rows={3}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="alice@acme.com, bob@acme.com&#10;charlie@acme.com"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Separate with commas, semicolons or newlines. Up to 50 per send.
            </p>
            {emails.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {emails.map((email, i) => (
                  <Badge key={email} variant="secondary" className="gap-1">
                    {email}
                    <button
                      type="button"
                      onClick={() =>
                        setRawInput(emails.filter((_, idx) => idx !== i).join(", "))
                      }
                      aria-label={`Remove ${email}`}
                      className="-mr-1 ml-1 rounded p-0.5 hover:bg-foreground/10"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {emails.length > 0 ? (
            <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              About to send <strong>{emails.length}</strong> invitation
              {emails.length === 1 ? "" : "s"} as <strong>{role}</strong>
              {teamId ? " on this team" : " in this organization"}.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={send.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending || emails.length === 0 || emails.length > 50}
          >
            {send.isPending ? "Sending…" : `Send ${emails.length || ""} invitation${emails.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Lenient email extractor — splits on common separators + whitespace, then
 * filters anything that doesn't look like an address. Lets the user paste
 * a CSV without thinking about the format.
 */
function extractEmails(raw: string): string[] {
  const candidates = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // Loose pattern is fine — the server's z.email() is the strict gate.
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return Array.from(new Set(candidates.filter((c) => re.test(c))));
}

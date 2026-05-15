"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@root/lib/auth-client";
import { Button } from "@root/components/ui/button";

/**
 * Sign-out is split out as a tiny client island so the rest of the admin
 * layout can stay a Server Component. `authClient.signOut()` clears the
 * Better Auth session cookie via the `nextCookies` server-action helper —
 * we just need to refresh the router so the layout re-evaluates and
 * redirects to `/sign-in`.
 */
export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const { error: signOutError } = await authClient.signOut();
      if (signOutError) {
        setError(signOutError.message ?? "Sign-out failed.");
        return;
      }
      router.replace("/sign-in");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
      <Button variant="ghost" size="sm" onClick={onClick} disabled={isPending}>
        {isPending ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@root/lib/auth-client";
import { Button } from "@root/components/ui/button";
import { Input } from "@root/components/ui/input";
import { Label } from "@root/components/ui/label";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function CreateOrganizationForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [touchedSlug, setTouchedSlug] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Derived state: compute on render rather than mirroring with setState.
  const effectiveSlug = touchedSlug ? slug : slugify(name);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const result = await authClient.organization.create({
      name,
      slug: effectiveSlug,
    });
    setSubmitting(false);

    if (result.error) {
      toast.error(result.error.message ?? "Could not create organization.");
      return;
    }

    toast.success("Organization created");
    if (result.data?.id) {
      await authClient.organization.setActive({ organizationId: result.data.id });
    }
    router.push("/organizations");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Inc."
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          required
          minLength={2}
          maxLength={48}
          value={effectiveSlug}
          onChange={(e) => {
            setTouchedSlug(true);
            setSlug(slugify(e.target.value));
          }}
          placeholder="acme"
          pattern="[a-z0-9-]+"
        />
        <p className="text-xs text-muted-foreground">
          URL-safe identifier — lowercase letters, digits, and hyphens.
        </p>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || !name || !effectiveSlug}>
          {submitting ? "Creating…" : "Create organization"}
        </Button>
      </div>
    </form>
  );
}

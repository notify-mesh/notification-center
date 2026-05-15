"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@root/lib/auth-client";
import { Button } from "@root/components/ui/button";
import { Input } from "@root/components/ui/input";
import { Label } from "@root/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@root/components/ui/select";

interface InitialProfile {
  name: string;
  username: string;
  displayUsername: string;
  locale: string;
  timezone: string;
}

const LOCALES = [
  { value: "fa-IR", label: "فارسی (Iran)" },
  { value: "en-US", label: "English (US)" },
  { value: "ar-SA", label: "العربية (Saudi)" },
] as const;

const TIMEZONES = [
  "Asia/Tehran",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "UTC",
] as const;

/**
 * Editable profile form. Persists via Better Auth's `updateUser` so the
 * session cookie + JWTs pick up the change on next request.
 */
export function AccountClient({ initial }: { initial: InitialProfile }) {
  const [name, setName] = React.useState(initial.name);
  const [username, setUsername] = React.useState(initial.username);
  const [displayUsername, setDisplayUsername] = React.useState(initial.displayUsername);
  const [locale, setLocale] = React.useState(initial.locale);
  const [timezone, setTimezone] = React.useState(initial.timezone);

  const dirty =
    name !== initial.name ||
    username !== initial.username ||
    displayUsername !== initial.displayUsername ||
    locale !== initial.locale ||
    timezone !== initial.timezone;

  const save = useMutation({
    mutationFn: async () => {
      const res = await authClient.updateUser({
        name,
        username,
        displayUsername,
        // Custom fields live in `data` — Better Auth's extensible update.
        // The `additionalFields` plugin sees these and writes them through.
        ...({ locale, timezone } as Record<string, unknown>),
      });
      if (res.error) throw new Error(res.error.message ?? "Could not update profile");
    },
    onSuccess: () => {
      toast.success("Profile updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="acc-name">Display name</Label>
        <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="acc-username">Username</Label>
        <Input
          id="acc-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          pattern="[a-zA-Z0-9_.-]+"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="acc-display">Display username</Label>
        <Input
          id="acc-display"
          value={displayUsername}
          onChange={(e) => setDisplayUsername(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Locale</Label>
        <Select value={locale} onValueChange={setLocale}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCALES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Timezone</Label>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <Button type="submit" disabled={!dirty || save.isPending}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

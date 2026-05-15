"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { client } from "@root/lib/orpc/client";
import { Button } from "@root/components/ui/button";
import { Input } from "@root/components/ui/input";
import { Label } from "@root/components/ui/label";
import { Textarea } from "@root/components/ui/textarea";
import { Switch } from "@root/components/ui/switch";
import { Checkbox } from "@root/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@root/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@root/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@root/components/ui/dialog";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export function CreateApiKeyForm() {
  const router = useRouter();
  const [revealedToken, setRevealedToken] = React.useState<string | null>(null);

  const optionsQuery = useQuery({
    queryKey: ["api-keys", "options"],
    queryFn: async () => client.apiKeys.options({}),
  });

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [environmentId, setEnvironmentId] = React.useState("");
  const [teamId, setTeamId] = React.useState<string>("");
  const [canRead, setCanRead] = React.useState(true);
  const [canWrite, setCanWrite] = React.useState(false);
  const [requireHttps, setRequireHttps] = React.useState(true);
  const [restrictionMode, setRestrictionMode] = React.useState<"allow" | "deny">("allow");
  const [allowedMethods, setAllowedMethods] = React.useState<string[]>(["GET", "POST"]);
  const [scopesInput, setScopesInput] = React.useState("");
  const [ipsInput, setIpsInput] = React.useState("");
  const [countriesInput, setCountriesInput] = React.useState("");
  const [originsInput, setOriginsInput] = React.useState("");
  const [tagsInput, setTagsInput] = React.useState("");
  const [rate, setRate] = React.useState("10");
  const [minute, setMinute] = React.useState("");
  const [hour, setHour] = React.useState("");
  const [daily, setDaily] = React.useState("");
  const [monthly, setMonthly] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");

  // When the user picks a project, auto-pick its default environment. Done
  // inside the `onValueChange` handler below — pure-render avoids the
  // setState-in-effect pattern lint correctly flags.
  const project = optionsQuery.data?.projects.find((p) => p.id === projectId);

  const createMutation = useMutation({
    mutationFn: async () => {
      const parseList = (s: string) =>
        s
          .split(/[,\n]/)
          .map((v) => v.trim())
          .filter(Boolean);
      const parseInt = (s: string) => (s ? Number.parseInt(s, 10) : undefined);

      return client.apiKeys.create({
        name,
        description: description || undefined,
        projectId,
        environmentId,
        teamId: teamId && teamId !== "__none__" ? teamId : undefined,
        canRead,
        canWrite,
        scopes: parseList(scopesInput),
        ipRestrictions: parseList(ipsInput),
        countryRestrictions: parseList(countriesInput).map((c) => c.toUpperCase()),
        restrictionMode,
        websiteOrigins: parseList(originsInput),
        allowedMethods: allowedMethods as Array<(typeof METHODS)[number]>,
        requireHttps,
        rateLimitPerSecond: parseInt(rate) ?? 10,
        minuteQuota: parseInt(minute),
        hourQuota: parseInt(hour),
        dailyQuota: parseInt(daily),
        monthlyQuota: parseInt(monthly),
        tags: parseList(tagsInput),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
    },
    onSuccess: (result) => {
      toast.success("Key issued. Copy the token now — it won't be shown again.");
      setRevealedToken(result.token);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const projects = optionsQuery.data?.projects ?? [];
  const teams = optionsQuery.data?.teams.filter((t) => t.isActive) ?? [];
  const environments = project?.environments ?? [];

  function toggleMethod(m: string, checked: boolean) {
    setAllowedMethods((prev) =>
      checked ? [...new Set([...prev, m])] : prev.filter((x) => x !== m),
    );
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="grid gap-6 lg:grid-cols-2"
      >
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>Name + scope of the key.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Production backend"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What service will use this key?"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Project</Label>
              <Select
                value={projectId}
                onValueChange={(id) => {
                  setProjectId(id);
                  // Auto-pick the default environment for the chosen project.
                  const next = optionsQuery.data?.projects.find((p) => p.id === id);
                  const defaultEnv =
                    next?.environments.find((e) => e.isDefault) ?? next?.environments[0];
                  setEnvironmentId(defaultEnv?.id ?? "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Projects</SelectLabel>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Environment</Label>
              <Select
                value={environmentId}
                onValueChange={setEnvironmentId}
                disabled={!projectId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an environment" />
                </SelectTrigger>
                <SelectContent>
                  {environments.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} {e.isDefault ? "· default" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Team (optional)</Label>
              {/* Radix Select reserves `""` for "show placeholder", so we
                  use a non-empty sentinel and translate at submit time. */}
              <Select value={teamId || "__none__"} onValueChange={setTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="No team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No team</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="expiresAt">Expires (optional)</Label>
              <Input
                id="expiresAt"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
            <CardDescription>Coarse-grained read/write + fine-grained scopes.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ToggleRow
              label="Read"
              description="Allows GET-style operations."
              checked={canRead}
              onChange={setCanRead}
            />
            <ToggleRow
              label="Write"
              description="Allows POST/PATCH/DELETE operations."
              checked={canWrite}
              onChange={setCanWrite}
            />
            <ToggleRow
              label="Require HTTPS"
              description="Reject plaintext HTTP calls from this key."
              checked={requireHttps}
              onChange={setRequireHttps}
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="scopes">Scopes</Label>
              <Textarea
                id="scopes"
                value={scopesInput}
                onChange={(e) => setScopesInput(e.target.value)}
                placeholder="sms.send, templates.read"
              />
              <p className="text-xs text-muted-foreground">
                Free-form strings. Comma- or newline-separated. Empty = inherits read/write.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Allowed HTTP methods</Label>
              <div className="flex flex-wrap gap-3 pt-1">
                {METHODS.map((m) => {
                  const id = `method-${m}`;
                  return (
                    <label key={m} htmlFor={id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        id={id}
                        checked={allowedMethods.includes(m)}
                        onCheckedChange={(c) => toggleMethod(m, c === true)}
                      />
                      {m}
                    </label>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Network restrictions</CardTitle>
            <CardDescription>
              Allow-list IPs, countries, and request origins. Use the mode switch to flip
              to a deny-list.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-col gap-2">
              <Label>Mode</Label>
              <Select
                value={restrictionMode}
                onValueChange={(v) => setRestrictionMode(v as "allow" | "deny")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow listed (deny everything else)</SelectItem>
                  <SelectItem value="deny">Deny listed (allow everything else)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ips">IPs / CIDRs</Label>
              <Textarea
                id="ips"
                value={ipsInput}
                onChange={(e) => setIpsInput(e.target.value)}
                placeholder="203.0.113.0/24, 198.51.100.42"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="countries">Countries (ISO-3166-1 alpha-2)</Label>
              <Input
                id="countries"
                value={countriesInput}
                onChange={(e) => setCountriesInput(e.target.value)}
                placeholder="IR, US, DE"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="origins">Allowed origins (CORS)</Label>
              <Textarea
                id="origins"
                value={originsInput}
                onChange={(e) => setOriginsInput(e.target.value)}
                placeholder="https://app.example.com"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quotas & rate limit</CardTitle>
            <CardDescription>
              Token-bucket per second plus fixed-window quotas per minute / hour / day / month.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <NumberInput
              id="rate"
              label="Rate per second"
              hint="Soft limit; bursts are absorbed by the token bucket."
              value={rate}
              onChange={setRate}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberInput id="minute" label="Per minute" value={minute} onChange={setMinute} />
              <NumberInput id="hour" label="Per hour" value={hour} onChange={setHour} />
              <NumberInput id="daily" label="Per day" value={daily} onChange={setDaily} />
              <NumberInput
                id="monthly"
                label="Per month"
                value={monthly}
                onChange={setMonthly}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="prod, mission-critical"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 lg:col-span-2">
          <Button type="button" variant="ghost" onClick={() => router.push("/api-keys")}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending || !name || !projectId || !environmentId}
          >
            {createMutation.isPending ? "Issuing…" : "Issue key"}
          </Button>
        </div>
      </form>

      <Dialog
        open={!!revealedToken}
        onOpenChange={(o) => {
          if (!o) {
            setRevealedToken(null);
            router.push("/api-keys");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your new key</DialogTitle>
            <DialogDescription>
              We don&apos;t store the plaintext. After you close this dialog, only the masked
              prefix remains visible.
            </DialogDescription>
          </DialogHeader>
          {revealedToken ? (
            <div className="flex flex-col gap-2">
              <Label>Token</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={revealedToken} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(revealedToken);
                    toast.success("Copied to clipboard");
                  }}
                >
                  <Copy />
                </Button>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => {
                setRevealedToken(null);
                router.push("/api-keys");
              }}
            >
              I&apos;ve saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function NumberInput({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

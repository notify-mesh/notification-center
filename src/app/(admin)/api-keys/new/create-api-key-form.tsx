"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Folder,
  Gauge,
  KeyRound,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { client } from "@root/lib/orpc/client";
import { cn } from "@root/lib/utils";
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
import { Card, CardContent } from "@root/components/ui/card";
import { Badge } from "@root/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@root/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@root/components/ui/collapsible";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

type StepId = "identity" | "permissions" | "limits" | "review";
const STEPS: ReadonlyArray<{ id: StepId; title: string; icon: typeof Folder }> = [
  { id: "identity", title: "Identity", icon: Folder },
  { id: "permissions", title: "Permissions", icon: KeyRound },
  { id: "limits", title: "Limits", icon: Gauge },
  { id: "review", title: "Review", icon: Sparkles },
];

interface FormState {
  name: string;
  description: string;
  projectId: string;
  environmentId: string;
  teamId: string;
  canRead: boolean;
  canWrite: boolean;
  requireHttps: boolean;
  restrictionMode: "allow" | "deny";
  allowedMethods: string[];
  scopes: string;
  ips: string;
  countries: string;
  origins: string;
  tags: string;
  rate: string;
  minute: string;
  hour: string;
  daily: string;
  monthly: string;
  expiresAt: string;
}

const DEFAULT_STATE: FormState = {
  name: "",
  description: "",
  projectId: "",
  environmentId: "",
  teamId: "",
  canRead: true,
  canWrite: false,
  requireHttps: true,
  restrictionMode: "allow",
  allowedMethods: ["GET", "POST"],
  scopes: "",
  ips: "",
  countries: "",
  origins: "",
  tags: "",
  rate: "10",
  minute: "",
  hour: "",
  daily: "",
  monthly: "",
  expiresAt: "",
};

const parseList = (s: string) =>
  s
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
const toInt = (s: string) => (s ? Number.parseInt(s, 10) : undefined);

export function CreateApiKeyForm() {
  const router = useRouter();
  const [stepIdx, setStepIdx] = React.useState(0);
  const [revealedToken, setRevealedToken] = React.useState<string | null>(null);
  const [state, setState] = React.useState<FormState>(DEFAULT_STATE);
  const update = React.useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) =>
      setState((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const optionsQuery = useQuery({
    queryKey: ["api-keys", "options"],
    queryFn: async () => client.apiKeys.options({}),
  });

  const projects = optionsQuery.data?.projects ?? [];
  const teams = optionsQuery.data?.teams.filter((t) => t.isActive) ?? [];
  const project = projects.find((p) => p.id === state.projectId);
  const environments = project?.environments ?? [];

  const createMutation = useMutation({
    mutationFn: async () =>
      client.apiKeys.create({
        name: state.name,
        description: state.description || undefined,
        projectId: state.projectId,
        environmentId: state.environmentId,
        teamId: state.teamId && state.teamId !== "__none__" ? state.teamId : undefined,
        canRead: state.canRead,
        canWrite: state.canWrite,
        scopes: parseList(state.scopes),
        ipRestrictions: parseList(state.ips),
        countryRestrictions: parseList(state.countries).map((c) => c.toUpperCase()),
        restrictionMode: state.restrictionMode,
        websiteOrigins: parseList(state.origins),
        allowedMethods: state.allowedMethods as Array<(typeof METHODS)[number]>,
        requireHttps: state.requireHttps,
        rateLimitPerSecond: toInt(state.rate) ?? 10,
        minuteQuota: toInt(state.minute),
        hourQuota: toInt(state.hour),
        dailyQuota: toInt(state.daily),
        monthlyQuota: toInt(state.monthly),
        tags: parseList(state.tags),
        expiresAt: state.expiresAt ? new Date(state.expiresAt).toISOString() : undefined,
      }),
    onSuccess: (result) => {
      toast.success("Key issued. Copy the token now — it won't be shown again.");
      setRevealedToken(result.token);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canAdvance: Record<StepId, boolean> = {
    identity: Boolean(state.name && state.projectId && state.environmentId),
    permissions: state.canRead || state.canWrite,
    limits: true,
    review: true,
  };
  const currentStep = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <Stepper currentIdx={stepIdx} onJump={setStepIdx} completed={canAdvance} />

          <Card className="overflow-hidden">
            <CardContent className="p-6">
              {currentStep.id === "identity" ? (
                <IdentityStep
                  state={state}
                  update={update}
                  projects={projects}
                  environments={environments}
                  teams={teams}
                  onProjectChange={(id) => {
                    update("projectId", id);
                    const next = projects.find((p) => p.id === id);
                    const defaultEnv =
                      next?.environments.find((e) => e.isDefault) ?? next?.environments[0];
                    update("environmentId", defaultEnv?.id ?? "");
                  }}
                />
              ) : null}
              {currentStep.id === "permissions" ? (
                <PermissionsStep state={state} update={update} />
              ) : null}
              {currentStep.id === "limits" ? <LimitsStep state={state} update={update} /> : null}
              {currentStep.id === "review" ? (
                <ReviewStep
                  state={state}
                  project={project}
                  environment={environments.find((e) => e.id === state.environmentId)}
                  team={teams.find((t) => t.id === state.teamId)}
                />
              ) : null}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => (stepIdx === 0 ? router.push("/api-keys") : setStepIdx(stepIdx - 1))}
            >
              <ArrowLeft />
              {stepIdx === 0 ? "Cancel" : "Back"}
            </Button>
            {!isLast ? (
              <Button
                type="button"
                onClick={() => setStepIdx(stepIdx + 1)}
                disabled={!canAdvance[currentStep.id]}
              >
                Continue
                <ArrowRight />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !canAdvance.identity}
              >
                {createMutation.isPending ? "Issuing…" : "Issue key"}
                <Check />
              </Button>
            )}
          </div>
        </div>

        <SummaryRail
          state={state}
          project={project}
          environment={environments.find((e) => e.id === state.environmentId)}
          team={teams.find((t) => t.id === state.teamId)}
        />
      </div>

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

function Stepper({
  currentIdx,
  onJump,
  completed,
}: {
  currentIdx: number;
  onJump: (idx: number) => void;
  completed: Record<StepId, boolean>;
}) {
  return (
    <ol className="flex w-full items-center gap-2">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const isActive = idx === currentIdx;
        const isDone = idx < currentIdx && completed[step.id];
        const canJump = idx <= currentIdx || completed[STEPS[Math.max(0, idx - 1)].id];
        return (
          <li key={step.id} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              disabled={!canJump}
              onClick={() => canJump && onJump(idx)}
              className={cn(
                "group flex flex-1 items-center gap-2 rounded-lg border p-2 text-left transition",
                isActive
                  ? "border-primary bg-primary/5"
                  : isDone
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-border bg-card",
                canJump && !isActive ? "hover:border-primary/50" : "",
                !canJump ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-medium",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {isDone ? <Check className="size-4" /> : <Icon className="size-3.5" />}
              </span>
              <span className="hidden flex-col sm:flex">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Step {idx + 1}
                </span>
                <span className="text-sm font-medium leading-none">{step.title}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ─────────────────────────────────────────────────────────── steps
function IdentityStep({
  state,
  update,
  projects,
  environments,
  teams,
  onProjectChange,
}: {
  state: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  projects: ReadonlyArray<{ id: string; name: string; environments: ReadonlyArray<{ id: string; name: string; isDefault: boolean }> }>;
  environments: ReadonlyArray<{ id: string; name: string; isDefault: boolean }>;
  teams: ReadonlyArray<{ id: string; name: string }>;
  onProjectChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <StepHeader title="Name your key" subtitle="Pick a name your future self will recognise in an audit log." />
      <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            required
            value={state.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Production backend"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="expiresAt">Expires (optional)</Label>
          <Input
            id="expiresAt"
            type="datetime-local"
            value={state.expiresAt}
            onChange={(e) => update("expiresAt", e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={state.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="What service will use this key?"
          rows={2}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Project</Label>
          <Select value={state.projectId} onValueChange={onProjectChange}>
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
            value={state.environmentId}
            onValueChange={(v) => update("environmentId", v)}
            disabled={!state.projectId}
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
      </div>

      <div className="flex flex-col gap-2">
        <Label>Team (optional)</Label>
        <Select
          value={state.teamId || "__none__"}
          onValueChange={(v) => update("teamId", v === "__none__" ? "" : v)}
        >
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
    </div>
  );
}

function PermissionsStep({
  state,
  update,
}: {
  state: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  function toggleMethod(m: string, checked: boolean) {
    update(
      "allowedMethods",
      checked
        ? [...new Set([...state.allowedMethods, m])]
        : state.allowedMethods.filter((x) => x !== m),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        title="What can this key do?"
        subtitle="Start broad with read/write, then narrow with scopes if you need to."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <PermissionTile
          label="Read"
          description="GET-style operations."
          checked={state.canRead}
          onChange={(v) => update("canRead", v)}
        />
        <PermissionTile
          label="Write"
          description="POST · PATCH · DELETE."
          checked={state.canWrite}
          onChange={(v) => update("canWrite", v)}
        />
        <PermissionTile
          label="HTTPS only"
          description="Reject plaintext HTTP."
          checked={state.requireHttps}
          onChange={(v) => update("requireHttps", v)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="scopes">Scopes</Label>
        <Textarea
          id="scopes"
          value={state.scopes}
          onChange={(e) => update("scopes", e.target.value)}
          placeholder="sms.send, templates.read"
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Free-form strings, comma- or newline-separated. Empty inherits the read/write toggles above.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Allowed HTTP methods</Label>
        <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">
          {METHODS.map((m) => {
            const id = `method-${m}`;
            const checked = state.allowedMethods.includes(m);
            return (
              <label
                key={m}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium transition",
                  checked
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:border-primary/50",
                )}
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={(c) => toggleMethod(m, c === true)}
                />
                {m}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LimitsStep({
  state,
  update,
}: {
  state: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        title="Rate limits & restrictions"
        subtitle="Defaults are sensible. Open advanced only if you have specific guard-rails."
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_1fr]">
        <NumberInput
          id="rate"
          label="Per second"
          value={state.rate}
          onChange={(v) => update("rate", v)}
        />
        <NumberInput
          id="minute"
          label="Per minute"
          value={state.minute}
          onChange={(v) => update("minute", v)}
        />
        <NumberInput
          id="hour"
          label="Per hour"
          value={state.hour}
          onChange={(v) => update("hour", v)}
        />
        <NumberInput
          id="daily"
          label="Per day"
          value={state.daily}
          onChange={(v) => update("daily", v)}
        />
      </div>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <ShieldAlert className="size-4" /> Advanced restrictions
            </span>
            <span className="text-xs text-muted-foreground">
              {advancedOpen ? "Hide" : "Show"}
            </span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 flex flex-col gap-4">
          <NumberInput
            id="monthly"
            label="Per month"
            value={state.monthly}
            onChange={(v) => update("monthly", v)}
          />
          <div className="flex flex-col gap-2">
            <Label>Restriction mode</Label>
            <Select
              value={state.restrictionMode}
              onValueChange={(v) => update("restrictionMode", v as "allow" | "deny")}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ips">IPs / CIDRs</Label>
              <Textarea
                id="ips"
                value={state.ips}
                onChange={(e) => update("ips", e.target.value)}
                placeholder="203.0.113.0/24, 198.51.100.42"
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="countries">Countries (ISO-3166-1 α-2)</Label>
              <Input
                id="countries"
                value={state.countries}
                onChange={(e) => update("countries", e.target.value)}
                placeholder="IR, US, DE"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="origins">Allowed CORS origins</Label>
            <Textarea
              id="origins"
              value={state.origins}
              onChange={(e) => update("origins", e.target.value)}
              placeholder="https://app.example.com"
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              value={state.tags}
              onChange={(e) => update("tags", e.target.value)}
              placeholder="prod, mission-critical"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function ReviewStep({
  state,
  project,
  environment,
  team,
}: {
  state: FormState;
  project: { name: string } | undefined;
  environment: { name: string } | undefined;
  team: { name: string } | undefined;
}) {
  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        title="Looks good?"
        subtitle="Double-check before we mint the token. The plaintext is shown exactly once."
      />
      <dl className="grid gap-3 sm:grid-cols-2">
        <ReviewRow label="Name" value={state.name} />
        <ReviewRow
          label="Project · Env"
          value={`${project?.name ?? "—"} · ${environment?.name ?? "—"}`}
        />
        <ReviewRow label="Team" value={team?.name ?? "None"} />
        <ReviewRow
          label="Expires"
          value={state.expiresAt ? new Date(state.expiresAt).toLocaleString() : "Never"}
        />
        <ReviewRow
          label="Permissions"
          value={[
            state.canRead ? "Read" : null,
            state.canWrite ? "Write" : null,
            state.requireHttps ? "HTTPS only" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <ReviewRow
          label="Rate limit"
          value={`${state.rate || "—"}/s${state.minute ? ` · ${state.minute}/min` : ""}${
            state.hour ? ` · ${state.hour}/hr` : ""
          }${state.daily ? ` · ${state.daily}/day` : ""}`}
        />
        <ReviewRow label="Methods" value={state.allowedMethods.join(", ") || "None"} />
        <ReviewRow
          label="Scopes"
          value={parseList(state.scopes).length ? parseList(state.scopes).join(", ") : "Inherits R/W"}
        />
        <ReviewRow
          label="IPs"
          value={parseList(state.ips).length ? parseList(state.ips).join(", ") : "Any"}
        />
        <ReviewRow
          label="Countries"
          value={
            parseList(state.countries).length
              ? parseList(state.countries).map((c) => c.toUpperCase()).join(", ")
              : "Any"
          }
        />
      </dl>
      <div className="flex items-start gap-3 rounded-lg border border-amber-200/50 bg-amber-50/50 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-900/10">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-amber-900 dark:text-amber-200">
          The plaintext token is shown <strong>once</strong> after creation. We only store a hashed
          version. Store it in your secret manager immediately.
        </p>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-muted/20 p-3">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── summary rail
function SummaryRail({
  state,
  project,
  environment,
  team,
}: {
  state: FormState;
  project: { name: string } | undefined;
  environment: { name: string } | undefined;
  team: { name: string } | undefined;
}) {
  return (
    <aside className="sticky top-4 hidden h-fit flex-col gap-3 rounded-lg border bg-card p-4 lg:flex">
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-primary/10 p-1.5 text-primary">
          <KeyRound className="size-4" />
        </div>
        <div>
          <p className="text-sm font-medium leading-none">{state.name || "New API key"}</p>
          <p className="text-xs text-muted-foreground">
            {project?.name ?? "No project"} · {environment?.name ?? "—"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {state.canRead ? <Badge variant="outline">Read</Badge> : null}
        {state.canWrite ? <Badge variant="outline">Write</Badge> : null}
        {state.requireHttps ? <Badge variant="outline">HTTPS</Badge> : null}
        {team ? <Badge variant="secondary">{team.name}</Badge> : null}
      </div>
      <dl className="mt-2 grid gap-2 text-xs">
        <SummaryRow label="Methods" value={state.allowedMethods.join(", ") || "None"} />
        <SummaryRow label="Rate / s" value={state.rate || "10"} />
        <SummaryRow
          label="Quotas"
          value={
            [
              state.minute ? `${state.minute}/min` : null,
              state.hour ? `${state.hour}/hr` : null,
              state.daily ? `${state.daily}/day` : null,
              state.monthly ? `${state.monthly}/mo` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "None"
          }
        />
        <SummaryRow
          label="Scopes"
          value={
            parseList(state.scopes).length ? `${parseList(state.scopes).length} configured` : "—"
          }
        />
        <SummaryRow
          label="Restrictions"
          value={
            [
              parseList(state.ips).length ? `${parseList(state.ips).length} IPs` : null,
              parseList(state.countries).length
                ? `${parseList(state.countries).length} countries`
                : null,
              parseList(state.origins).length
                ? `${parseList(state.origins).length} origins`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || `None (${state.restrictionMode})`
          }
        />
        <SummaryRow
          label="Expires"
          value={state.expiresAt ? new Date(state.expiresAt).toLocaleDateString() : "Never"}
        />
      </dl>
      <div className="mt-2 flex items-start gap-2 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
        <p>The full token is shown once after creation. Only its hash is persisted.</p>
      </div>
    </aside>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── primitives
function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </header>
  );
}

function PermissionTile({
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
    <label
      className={cn(
        "flex cursor-pointer flex-col gap-1 rounded-lg border bg-card p-3 transition",
        checked ? "border-primary bg-primary/5" : "hover:border-primary/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </label>
  );
}

function NumberInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
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
    </div>
  );
}

"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { client } from "@root/lib/orpc/client";
import { Button } from "@root/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@root/components/ui/card";
import { Badge } from "@root/components/ui/badge";
import { Input } from "@root/components/ui/input";
import { Label } from "@root/components/ui/label";
import { Textarea } from "@root/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@root/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@root/components/ui/tabs";
import { Checkbox } from "@root/components/ui/checkbox";

const CHANNELS = ["sms", "email", "push", "bale", "telegram"] as const;

type Channel = (typeof CHANNELS)[number];

export function SendClient() {
  // ---- Scope pickers ----
  const projectsQuery = useQuery({
    queryKey: ["projects", false],
    queryFn: async () => (await client.projects.list({ includeArchived: false })).projects,
  });
  const projects = projectsQuery.data ?? [];
  const [pickedProjectId, setProjectId] = React.useState<string | null>(null);
  const projectId = pickedProjectId ?? projects[0]?.id ?? null;

  const envQuery = useQuery({
    queryKey: ["environments", projectId],
    enabled: !!projectId,
    queryFn: async () => (await client.environments.list({ projectId: projectId! })).environments,
  });
  const envs = envQuery.data ?? [];
  const [pickedEnvId, setEnvironmentId] = React.useState<string | null>(null);
  const environmentId =
    (pickedEnvId && envs.find((e) => e.id === pickedEnvId)?.id) ??
    envs.find((e) => e.isDefault)?.id ??
    envs[0]?.id ??
    null;

  // ---- Composer state ----
  const [channels, setChannels] = React.useState<Channel[]>(["sms"]);
  const [recipientPhone, setRecipientPhone] = React.useState("");
  const [recipientEmail, setRecipientEmail] = React.useState("");
  const [mode, setMode] = React.useState<"inline" | "template">("inline");
  const [body, setBody] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [templateName, setTemplateName] = React.useState("");
  const [variables, setVariables] = React.useState("{}");
  const [locale, setLocale] = React.useState("fa-IR");

  const templatesQuery = useQuery({
    queryKey: ["templates", projectId, "send"],
    enabled: !!projectId,
    queryFn: async () =>
      (await client.templates.list({ projectId: projectId!, includeArchived: false })).templates,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || !environmentId) throw new Error("Pick a project + environment first.");
      const recipient: { phone?: string; email?: string } = {};
      if (recipientPhone) recipient.phone = recipientPhone;
      if (recipientEmail) recipient.email = recipientEmail;

      const content =
        mode === "inline"
          ? { kind: "inline" as const, subject: subject || undefined, body: body || undefined }
          : {
              kind: "template" as const,
              templateName,
              variables: JSON.parse(variables || "{}") as Record<string, unknown>,
              locale,
            };

      return client.notifications.send({
        projectId,
        environmentId,
        channels,
        recipient,
        content,
        locale,
      });
    },
    onSuccess: (result) => {
      if (result.status === "SENT") {
        toast.success(`Sent via ${result.channelUsed ?? "?"}`);
      } else {
        toast.error("All attempts failed — see attempt log");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const result = sendMutation.data;

  function toggleChannel(c: Channel) {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  if (projects.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          You need a project before you can send notifications.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Compose</CardTitle>
          <CardDescription>
            Channels are tried in the order you list them — first success wins.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pb-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Project</Label>
              <Select value={projectId ?? undefined} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Environment</Label>
              <Select
                value={environmentId ?? undefined}
                onValueChange={setEnvironmentId}
                disabled={envs.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick" />
                </SelectTrigger>
                <SelectContent>
                  {envs.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} {e.isDefault ? "· default" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Channels (tried in order)</Label>
            <div className="flex flex-wrap gap-3">
              {CHANNELS.map((c) => {
                const id = `ch-${c}`;
                return (
                  <label key={c} htmlFor={id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={id}
                      checked={channels.includes(c)}
                      onCheckedChange={() => toggleChannel(c)}
                    />
                    {c}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="r-phone">Recipient phone</Label>
              <Input
                id="r-phone"
                placeholder="+98912…"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r-email">Recipient email</Label>
              <Input
                id="r-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
              />
            </div>
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "inline" | "template")}>
            <TabsList>
              <TabsTrigger value="inline">Inline content</TabsTrigger>
              <TabsTrigger value="template">Template</TabsTrigger>
            </TabsList>
            <TabsContent value="inline" className="flex flex-col gap-3 pt-3">
              {channels.includes("email") ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="i-subject">Subject (email)</Label>
                  <Input
                    id="i-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="i-body">Body</Label>
                <Textarea
                  id="i-body"
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hello! Your code is 123456"
                />
              </div>
            </TabsContent>
            <TabsContent value="template" className="flex flex-col gap-3 pt-3">
              <div className="flex flex-col gap-2">
                <Label>Template</Label>
                <Select value={templateName} onValueChange={setTemplateName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {(templatesQuery.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.name}>
                        {t.displayName} ({t.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="vars">Variables (JSON)</Label>
                <Textarea
                  id="vars"
                  rows={3}
                  value={variables}
                  onChange={(e) => setVariables(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="locale">Locale</Label>
                <Input id="locale" value={locale} onChange={(e) => setLocale(e.target.value)} />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end">
            <Button
              onClick={() => sendMutation.mutate()}
              disabled={
                sendMutation.isPending ||
                channels.length === 0 ||
                (!recipientPhone && !recipientEmail) ||
                (mode === "inline" ? !body : !templateName)
              }
            >
              <Send />
              {sendMutation.isPending ? "Sending…" : "Send notification"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last result</CardTitle>
          <CardDescription>Per-channel attempt log.</CardDescription>
        </CardHeader>
        <CardContent className="pb-6 text-sm">
          {!result ? (
            <p className="text-muted-foreground">Send something to see the trace.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Badge
                  variant={
                    result.status === "SENT"
                      ? "success"
                      : result.status === "QUEUED"
                        ? "warning"
                        : "destructive"
                  }
                >
                  {result.status}
                </Badge>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{result.id.slice(-8)}</code>
              </div>
              {result.channelUsed ? (
                <div>
                  via <Badge variant="outline">{result.channelUsed}</Badge>
                </div>
              ) : null}
              <ul className="flex flex-col gap-1.5">
                {result.attempts.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 rounded border p-2 text-xs">
                    <AttemptIcon status={a.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{a.channel}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {a.providerKey}
                        </Badge>
                      </div>
                      {a.reason ? (
                        <p className="mt-0.5 text-muted-foreground">{a.reason}</p>
                      ) : null}
                      {a.providerMessageId ? (
                        <p className="mt-0.5 break-all text-[10px] text-muted-foreground">
                          {a.providerMessageId}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AttemptIcon({ status }: { status: string }) {
  if (status === "SENT")
    return <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />;
  if (status === "FAILED")
    return <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
  return <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />;
}

"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, FileText, Plus, Send } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@root/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@root/components/ui/tabs";
import { Skeleton } from "@root/components/ui/skeleton";

type Template = NonNullable<Awaited<ReturnType<typeof client.templates.list>>>["templates"][number];

export function TemplatesClient() {
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({
    queryKey: ["projects", false],
    queryFn: async () => (await client.projects.list({ includeArchived: false })).projects,
  });
  const projects = projectsQuery.data ?? [];
  // Default to the first project. Tracking a sticky user choice with a
  // separate state value lets us derive the "effective" id without an
  // effect (no setState-in-effect cascade).
  const [pickedProjectId, setProjectId] = React.useState<string | null>(null);
  const projectId = pickedProjectId ?? projects[0]?.id ?? null;

  const templatesQuery = useQuery({
    queryKey: ["templates", projectId],
    enabled: !!projectId,
    queryFn: async () =>
      (await client.templates.list({ projectId: projectId!, includeArchived: false })).templates,
  });
  const templates = templatesQuery.data ?? [];

  const publish = useMutation({
    mutationFn: async (v: { templateId: string; variantId: string }) =>
      client.templates.publishVariant(v),
    onSuccess: () => {
      toast.success("Variant published");
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (projects.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          You need at least one project before creating templates.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Project</Label>
          <Select value={projectId ?? undefined} onValueChange={setProjectId}>
            <SelectTrigger size="sm" className="w-56">
              <SelectValue placeholder="Pick a project" />
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
        {projectId ? (
          <CreateTemplateDialog
            projectId={projectId}
            onCreated={() => queryClient.invalidateQueries({ queryKey: ["templates"] })}
          />
        ) : null}
      </div>

      {templatesQuery.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <FileText className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No templates yet</p>
              <p className="text-sm text-muted-foreground">
                Templates let you swap copy without code changes — versioned and channel-aware.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onPublish={(variantId) => publish.mutate({ templateId: t.id, variantId })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  onPublish,
}: {
  template: Template;
  onPublish: (variantId: string) => void;
}) {
  const [previewOpen, setPreviewOpen] = React.useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              {template.displayName}
              <Badge variant="outline" className="text-[10px] font-mono">
                {template.name}
              </Badge>
            </CardTitle>
            <CardDescription>{template.description || "No description"}</CardDescription>
          </div>
          <Badge variant="secondary">{template.category ?? "uncategorised"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-6">
        <div className="flex flex-wrap gap-2">
          {template.variants.map((v) => (
            <Badge
              key={v.id}
              variant={
                v.status === "PUBLISHED" ? "success" : v.status === "DRAFT" ? "warning" : "outline"
              }
              className="text-[10px] uppercase"
            >
              {v.channel}/{v.locale} · v{v.version} · {v.status.toLowerCase()}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Send /> Preview
          </Button>
          {template.variants
            .filter((v) => v.status === "DRAFT")
            .map((v) => (
              <Button key={v.id} variant="default" size="sm" onClick={() => onPublish(v.id)}>
                <CheckCircle2 /> Publish {v.channel}/{v.locale}
              </Button>
            ))}
        </div>
      </CardContent>

      <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} template={template} />
    </Card>
  );
}

function PreviewDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: Template;
}) {
  const channels = Array.from(new Set(template.variants.map((v) => v.channel)));
  const locales = Array.from(new Set(template.variants.map((v) => v.locale)));
  const [channel, setChannel] = React.useState(channels[0] ?? "sms");
  const [locale, setLocale] = React.useState(locales[0] ?? "fa-IR");
  const [vars, setVars] = React.useState("{}");

  const preview = useMutation({
    mutationFn: async () => {
      const variables = JSON.parse(vars || "{}") as Record<string, unknown>;
      return client.templates.preview({
        templateId: template.id,
        channel: channel as "sms" | "email" | "push" | "bale" | "telegram",
        locale,
        variables,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview · {template.displayName}</DialogTitle>
          <DialogDescription>
            Renders the latest variant. Variables are JSON; missing keys are echoed back literally.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channels.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Locale</Label>
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Variables (JSON)</Label>
          <Textarea
            value={vars}
            onChange={(e) => setVars(e.target.value)}
            className="font-mono text-xs"
            rows={3}
            placeholder='{"name": "Ali"}'
          />
        </div>
        <Tabs defaultValue="text">
          <TabsList>
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="html">HTML</TabsTrigger>
            <TabsTrigger value="subject">Subject</TabsTrigger>
          </TabsList>
          <TabsContent value="text">
            <pre className="rounded border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
              {preview.data?.text ?? "(run preview to see output)"}
            </pre>
          </TabsContent>
          <TabsContent value="html">
            <pre className="max-h-80 overflow-auto rounded border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
              {preview.data?.html ?? "(run preview to see output)"}
            </pre>
          </TabsContent>
          <TabsContent value="subject">
            <pre className="rounded border bg-muted/30 p-3 text-xs">
              {preview.data?.subject ?? "(run preview to see output)"}
            </pre>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => preview.mutate()} disabled={preview.isPending}>
            {preview.isPending ? "Rendering…" : "Render"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateTemplateDialog({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [channel, setChannel] = React.useState<"sms" | "email" | "bale" | "push" | "telegram">(
    "sms",
  );
  const [locale, setLocale] = React.useState("fa-IR");
  const [text, setText] = React.useState("");
  const [subject, setSubject] = React.useState("");

  const create = useMutation({
    mutationFn: async () =>
      client.templates.create({
        projectId,
        name,
        displayName: displayName || name,
        variants: [
          {
            channel,
            locale,
            text: text || undefined,
            subject: channel === "email" ? subject : undefined,
          },
        ],
      }),
    onSuccess: () => {
      toast.success("Template created (DRAFT). Publish to start sending.");
      setOpen(false);
      setName("");
      setDisplayName("");
      setText("");
      setSubject("");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New template
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create template</DialogTitle>
          <DialogDescription>
            One initial variant — add more channels/locales later. `{`{{var}}`}` syntax for variable
            interpolation.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="t-name">Name (slug)</Label>
            <Input
              id="t-name"
              required
              pattern="[a-z0-9-]+"
              value={name}
              onChange={(e) =>
                setName(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]+/g, "-")
                    .replace(/^-+|-+$/g, ""),
                )
              }
              placeholder="login-otp"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="t-display">Display name</Label>
            <Input
              id="t-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Login OTP"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="bale">Bale</SelectItem>
                <SelectItem value="push">Push</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="t-locale">Locale</Label>
            <Input id="t-locale" value={locale} onChange={(e) => setLocale(e.target.value)} />
          </div>
          {channel === "email" ? (
            <div className="sm:col-span-2 flex flex-col gap-2">
              <Label htmlFor="t-subject">Subject</Label>
              <Input
                id="t-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="خوش آمدید {{name}}"
              />
            </div>
          ) : null}
          <div className="sm:col-span-2 flex flex-col gap-2">
            <Label htmlFor="t-text">Body</Label>
            <Textarea
              id="t-text"
              dir="rtl"
              className="font-mono text-xs resize-none leading-tight tracking-tight text-muted-foreground unicode-plaintext"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="رمز ورود شما: {{code}}"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name || !text}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArrowUpRight,
  Folder,
  MoreHorizontal,
  Plus,
  RotateCcw,
} from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@root/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@root/components/ui/dropdown-menu";
import { Skeleton } from "@root/components/ui/skeleton";
import { Switch } from "@root/components/ui/switch";

export function ProjectsClient() {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["projects", showArchived],
    queryFn: async () => (await client.projects.list({ includeArchived: showArchived })).projects,
  });

  const archive = useMutation({
    mutationFn: async (id: string) => client.projects.archive({ projectId: id }),
    onSuccess: () => {
      toast.success("Project archived");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const restore = useMutation({
    mutationFn: async (id: string) => client.projects.restore({ projectId: id }),
    onSuccess: () => {
      toast.success("Project restored");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const projects = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {projects.length} project{projects.length === 1 ? "" : "s"}
          <label className="flex items-center gap-2">
            <Switch
              checked={showArchived}
              onCheckedChange={setShowArchived}
              aria-label="Show archived"
            />
            <span>Show archived</span>
          </label>
        </div>
        <CreateProjectDialog
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["projects"] })}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Folder className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No projects yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first project to start configuring channels and API keys.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className={p.archivedAt ? "opacity-60" : undefined}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Folder className="size-5" />
                  </div>
                  <div className="flex items-center gap-2">
                    {p.archivedAt ? (
                      <Badge variant="warning">Archived</Badge>
                    ) : p.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="outline">Disabled</Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {p.archivedAt ? (
                          <DropdownMenuItem onClick={() => restore.mutate(p.id)}>
                            <RotateCcw /> Restore
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => archive.mutate(p.id)}
                          >
                            <Archive /> Archive
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <CardTitle className="mt-2">{p.name}</CardTitle>
                <CardDescription>{p.description || `slug · ${p.slug}`}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pb-6">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <Stat label="Envs" value={p.environmentCount} />
                  <Stat label="API keys" value={p.apiKeyCount} />
                  <Stat label="Retain" value={`${p.retentionDays}d`} />
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/projects/${p.id}` as never}>
                    Open
                    <ArrowUpRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function CreateProjectDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [touchedSlug, setTouchedSlug] = React.useState(false);
  const effectiveSlug = touchedSlug
    ? slug
    : name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);

  const mutation = useMutation({
    mutationFn: async () =>
      client.projects.create({
        name,
        description: description || undefined,
        slug: effectiveSlug || undefined,
      }),
    onSuccess: () => {
      toast.success("Project created. Production + development envs ready.");
      setOpen(false);
      setName("");
      setSlug("");
      setDescription("");
      setTouchedSlug(false);
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Provisions a project with two default environments (production +
            development) atomically.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Storefront"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-slug">Slug</Label>
            <Input
              id="project-slug"
              required
              pattern="[a-z0-9-]+"
              maxLength={40}
              value={effectiveSlug}
              onChange={(e) => {
                setTouchedSlug(true);
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]+/g, "-")
                    .replace(/^-+|-+$/g, ""),
                );
              }}
              placeholder="my-storefront"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !name || !effectiveSlug}
          >
            {mutation.isPending ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

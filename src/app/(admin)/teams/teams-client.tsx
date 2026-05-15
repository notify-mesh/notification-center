"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreHorizontal, Plus, Users, PowerOff, Power, Pencil, Trash2 } from "lucide-react";
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
import { Switch } from "@root/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@root/components/ui/table";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@root/components/ui/dropdown-menu";
import { Skeleton } from "@root/components/ui/skeleton";

interface Team {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  isActive: boolean;
  createdAt: string;
  memberCount: number;
}

export function TeamsClient() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await client.teams.list({});
      return res.teams as Team[];
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: async ({ teamId, isActive }: { teamId: string; isActive: boolean }) =>
      client.teams.setActive({ teamId, isActive }),
    onSuccess: (_, vars) => {
      toast.success(vars.isActive ? "Team activated" : "Team deactivated");
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (teamId: string) => client.teams.remove({ teamId }),
    onSuccess: () => {
      toast.success("Team deleted");
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const teams = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {teams.length} team{teams.length === 1 ? "" : "s"} ·{" "}
          {teams.filter((t) => t.isActive).length} active
        </div>
        <CreateTeamDialog
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["teams"] })}
        />
      </div>

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{error.message}</CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : teams.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Users className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No teams yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first team to scope API keys and projects.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All teams</CardTitle>
            <CardDescription>Manage membership, status, and lifecycle.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{team.name}</span>
                        {team.description ? (
                          <span className="text-xs text-muted-foreground">
                            {team.description}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{team.memberCount}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={team.isActive}
                          onCheckedChange={(checked) =>
                            setActiveMutation.mutate({ teamId: team.id, isActive: checked })
                          }
                          disabled={setActiveMutation.isPending}
                        />
                        <Badge variant={team.isActive ? "success" : "outline"}>
                          {team.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(team.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <TeamRowActions
                        team={team}
                        onChanged={() =>
                          queryClient.invalidateQueries({ queryKey: ["teams"] })
                        }
                        onToggle={(isActive) =>
                          setActiveMutation.mutate({ teamId: team.id, isActive })
                        }
                        onDelete={() => deleteMutation.mutate(team.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CreateTeamDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const mutation = useMutation({
    mutationFn: async () =>
      client.teams.create({ name, description: description || undefined }),
    onSuccess: () => {
      toast.success("Team created");
      setName("");
      setDescription("");
      setOpen(false);
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create team</DialogTitle>
          <DialogDescription>
            Teams group members and scope which API keys they can manage.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Payments engineering"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="team-description">Description</Label>
            <Textarea
              id="team-description"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this team own?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name}>
            {mutation.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamRowActions({
  team,
  onChanged,
  onToggle,
  onDelete,
}: {
  team: Team;
  onChanged: () => void;
  onToggle: (isActive: boolean) => void;
  onDelete: () => void;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onToggle(!team.isActive)}>
            {team.isActive ? <PowerOff /> : <Power />}
            {team.isActive ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditTeamDialog
        key={team.id}
        team={team}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => {
          setEditOpen(false);
          onChanged();
        }}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this team?</DialogTitle>
            <DialogDescription>
              {team.memberCount > 0
                ? `Removes the team and its ${team.memberCount} membership${team.memberCount === 1 ? "" : "s"}. API keys lose team scoping but remain.`
                : "This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteOpen(false);
                onDelete();
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditTeamDialog({
  team,
  open,
  onOpenChange,
  onSaved,
}: {
  team: Team;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  // `key={team.id}` on the parent ensures this dialog re-mounts when a
  // different team is selected — no need to mirror props with setState in an
  // effect. The fresh `useState` initial value picks up the new team.
  const [name, setName] = React.useState(team.name);
  const [description, setDescription] = React.useState(team.description ?? "");

  const mutation = useMutation({
    mutationFn: async () =>
      client.teams.update({
        teamId: team.id,
        name,
        description: description || null,
      }),
    onSuccess: () => {
      toast.success("Team updated");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit team</DialogTitle>
          <DialogDescription>Update the team&apos;s name or description.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`name-${team.id}`}>Name</Label>
            <Input
              id={`name-${team.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`desc-${team.id}`}>Description</Label>
            <Textarea
              id={`desc-${team.id}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import {
  Activity as ActivityIcon,
  ChevronRight,
  KeyRound,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
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
import { Checkbox } from "@root/components/ui/checkbox";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@root/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@root/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@root/components/ui/table";
import { Skeleton } from "@root/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@root/components/ui/avatar";

type Role = NonNullable<
  Awaited<ReturnType<typeof client.permissions.listRoles>>
>["roles"][number];

type Permission = NonNullable<
  Awaited<ReturnType<typeof client.permissions.listPermissions>>
>["permissions"][number];

type Assignment = NonNullable<
  Awaited<ReturnType<typeof client.permissions.listAssignments>>
>["assignments"][number];

type Member = NonNullable<
  Awaited<ReturnType<typeof client.permissions.listOrgMembers>>
>["members"][number];

export function PermissionsClient() {
  return (
    <Tabs defaultValue="roles" className="gap-4">
      <TabsList>
        <TabsTrigger value="roles">
          <ShieldCheck className="size-3.5" /> Roles
        </TabsTrigger>
        <TabsTrigger value="catalog">
          <KeyRound className="size-3.5" /> Permissions catalog
        </TabsTrigger>
        <TabsTrigger value="assignments">
          <Users className="size-3.5" /> Assignments
        </TabsTrigger>
      </TabsList>

      <TabsContent value="roles" className="mt-0">
        <RolesTab />
      </TabsContent>
      <TabsContent value="catalog" className="mt-0">
        <CatalogTab />
      </TabsContent>
      <TabsContent value="assignments" className="mt-0">
        <AssignmentsTab />
      </TabsContent>
    </Tabs>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Roles tab
// ─────────────────────────────────────────────────────────────────────────────
function RolesTab() {
  const queryClient = useQueryClient();
  const rolesQuery = useQuery({
    queryKey: ["permissions", "roles"],
    queryFn: async () => (await client.permissions.listRoles({})).roles,
  });
  const permissionsQuery = useQuery({
    queryKey: ["permissions", "catalog"],
    queryFn: async () => (await client.permissions.listPermissions({})).permissions,
  });

  const deleteMutation = useMutation({
    mutationFn: async (roleId: string) => client.permissions.deleteRole({ roleId }),
    onSuccess: () => {
      toast.success("Role deleted");
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roles = rolesQuery.data ?? [];
  const permissions = permissionsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {roles.length} role{roles.length === 1 ? "" : "s"} · {roles.filter((r) => r.isBuiltIn).length} built-in
        </div>
        <CreateRoleDialog permissions={permissions} />
      </div>

      {rolesQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {roles.map((r) => (
            <RoleCard
              key={r.id}
              role={r}
              permissions={permissions}
              onDelete={() => deleteMutation.mutate(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RoleCard({
  role,
  permissions,
  onDelete,
}: {
  role: Role;
  permissions: Permission[];
  onDelete: () => void;
}) {
  const [editOpen, setEditOpen] = React.useState(false);

  // Group role's permissions by category for compact display.
  const grants = new Set(role.permissions.map((p) => `${p.action}:${p.subject}`));
  const byCategory = new Map<string, Permission[]>();
  for (const p of permissions) {
    if (!grants.has(`${p.action}:${p.subject}`)) continue;
    const cat = p.category ?? "Other";
    const list = byCategory.get(cat) ?? [];
    list.push(p);
    byCategory.set(cat, list);
  }
  const hasWildcard = grants.has("manage:all");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {role.displayName}
              {role.isBuiltIn ? (
                <Badge variant="outline" className="text-[10px]">
                  built-in
                </Badge>
              ) : null}
              {!role.isActive ? <Badge variant="warning">inactive</Badge> : null}
            </CardTitle>
            <CardDescription>{role.description ?? `priority ${role.priority}`}</CardDescription>
          </div>
          {role.isBuiltIn ? (
            <Lock className="size-4 text-muted-foreground" aria-label="Built-in roles are immutable" />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil /> Edit permissions
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-6">
        {hasWildcard ? (
          <Badge variant="success">
            <ShieldCheck className="size-3" /> Full control (manage:all)
          </Badge>
        ) : byCategory.size === 0 ? (
          <p className="text-xs text-muted-foreground">No permissions granted.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {[...byCategory.entries()].map(([cat, perms]) => (
              <div key={cat} className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {cat}
                </span>
                {perms.map((p) => (
                  <Badge key={p.id} variant="secondary" className="text-[10px]">
                    {p.action}:{p.subject}
                  </Badge>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"}</span>
          {!role.isBuiltIn ? (
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
              Edit
              <ChevronRight />
            </Button>
          ) : null}
        </div>
      </CardContent>

      <EditPermissionsDialog
        // Remount-per-open so the initial set is captured fresh, avoiding
        // a setState-in-effect cascade.
        key={`${role.id}:${editOpen}`}
        role={role}
        permissions={permissions}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </Card>
  );
}

function CreateRoleDialog({ permissions }: { permissions: Permission[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState(10);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const create = useMutation({
    mutationFn: async () =>
      client.permissions.createRole({
        name,
        displayName: displayName || name,
        description: description || undefined,
        priority,
        permissionIds: [...selected],
      }),
    onSuccess: () => {
      toast.success("Role created");
      setOpen(false);
      setName("");
      setDisplayName("");
      setDescription("");
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New role
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create role</DialogTitle>
          <DialogDescription>
            Custom roles are scoped to the active organization. Permissions can be edited later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="role-name">Name (slug)</Label>
            <Input
              id="role-name"
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
              placeholder="senior-engineer"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="role-display">Display name</Label>
            <Input
              id="role-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Senior Engineer"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="role-desc">Description</Label>
            <Textarea
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="role-priority">Priority</Label>
            <Input
              id="role-priority"
              type="number"
              min={0}
              max={1000}
              value={priority}
              onChange={(e) => setPriority(Number.parseInt(e.target.value || "10", 10))}
            />
            <p className="text-xs text-muted-foreground">
              Higher wins on conflicting `cannot` rules.
            </p>
          </div>
        </div>

        <PermissionsPicker
          permissions={permissions}
          selected={selected}
          onChange={setSelected}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name}>
            {create.isPending ? "Creating…" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPermissionsDialog({
  role,
  permissions,
  open,
  onOpenChange,
}: {
  role: Role;
  permissions: Permission[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();

  // Initial selection from the role's current grants. Recomputed on open
  // so re-opening picks up any post-save changes.
  const initialSet = React.useMemo(() => {
    const out = new Set<string>();
    for (const p of role.permissions) {
      const match = permissions.find(
        (perm) => perm.action === p.action && perm.subject === p.subject,
      );
      if (match) out.add(match.id);
    }
    return out;
  }, [role.permissions, permissions]);

  // `key={role.id + (open ? "open" : "closed")}` from the parent forces a
  // remount when the dialog opens, so `useState(initialSet)` evaluates
  // fresh — no effect needed to sync prop → state.
  const [selected, setSelected] = React.useState<Set<string>>(initialSet);

  const save = useMutation({
    mutationFn: async () =>
      client.permissions.updateRolePerms({
        roleId: role.id,
        permissionIds: [...selected],
      }),
    onSuccess: () => {
      toast.success("Permissions updated");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role.displayName} · permissions</DialogTitle>
          <DialogDescription>
            Toggle to grant or revoke. Saving replaces the role&apos;s permission set entirely.
          </DialogDescription>
        </DialogHeader>
        <PermissionsPicker
          permissions={permissions}
          selected={selected}
          onChange={setSelected}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : `Save ${selected.size} permission${selected.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Category-grouped permission picker. Per-category "Toggle all" speeds up
 * common cases ("read everything in Notifications"). Used by both create
 * and edit role flows.
 */
function PermissionsPicker({
  permissions,
  selected,
  onChange,
}: {
  permissions: Permission[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const byCategory = React.useMemo(() => {
    const m = new Map<string, Permission[]>();
    for (const p of permissions) {
      const cat = p.category ?? "Other";
      const list = m.get(cat) ?? [];
      list.push(p);
      m.set(cat, list);
    }
    return [...m.entries()];
  }, [permissions]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function toggleAll(catPerms: Permission[]) {
    const allSelected = catPerms.every((p) => selected.has(p.id));
    const next = new Set(selected);
    for (const p of catPerms) {
      if (allSelected) next.delete(p.id);
      else next.add(p.id);
    }
    onChange(next);
  }

  return (
    <div className="flex max-h-96 flex-col gap-3 overflow-y-auto rounded-lg border p-3">
      {byCategory.map(([cat, perms]) => {
        const allChecked = perms.every((p) => selected.has(p.id));
        const someChecked = perms.some((p) => selected.has(p.id));
        return (
          <div key={cat} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">{cat}</h4>
              <button
                type="button"
                onClick={() => toggleAll(perms)}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {allChecked ? "Deselect all" : someChecked ? "Select all" : "Select all"}
              </button>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {perms.map((p) => {
                const id = `perm-${p.id}`;
                return (
                  <label
                    key={p.id}
                    htmlFor={id}
                    className="flex items-start gap-2 rounded-md border p-2 text-sm hover:bg-muted/30"
                  >
                    <Checkbox
                      id={id}
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggle(p.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{p.displayName}</span>
                        <Badge variant="outline" className="text-[9px] font-mono">
                          {p.action}:{p.subject}
                        </Badge>
                      </div>
                      {p.description ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog tab
// ─────────────────────────────────────────────────────────────────────────────
function CatalogTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["permissions", "catalog"],
    queryFn: async () => (await client.permissions.listPermissions({})).permissions,
  });
  const permissions = data ?? [];
  const byCategory = React.useMemo(() => {
    const m = new Map<string, Permission[]>();
    for (const p of permissions) {
      const cat = p.category ?? "Other";
      const list = m.get(cat) ?? [];
      list.push(p);
      m.set(cat, list);
    }
    return [...m.entries()];
  }, [permissions]);

  if (isLoading) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {byCategory.map(([cat, perms]) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle className="text-base">{cat}</CardTitle>
            <CardDescription>{perms.length} permission{perms.length === 1 ? "" : "s"}</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perms.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {p.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{p.subject}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.description ?? p.displayName}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Assignments tab
// ─────────────────────────────────────────────────────────────────────────────
function AssignmentsTab() {
  const queryClient = useQueryClient();
  const [userFilter, setUserFilter] = React.useState<string>("__all__");

  const membersQuery = useQuery({
    queryKey: ["permissions", "org-members"],
    queryFn: async () => (await client.permissions.listOrgMembers({})).members,
  });
  const members = membersQuery.data ?? [];

  const assignmentsQuery = useQuery({
    queryKey: ["permissions", "assignments", userFilter],
    queryFn: async () =>
      (
        await client.permissions.listAssignments({
          userId: userFilter === "__all__" ? undefined : userFilter,
        })
      ).assignments,
  });
  const assignments = assignmentsQuery.data ?? [];

  const rolesQuery = useQuery({
    queryKey: ["permissions", "roles"],
    queryFn: async () => (await client.permissions.listRoles({})).roles,
  });
  const roles = rolesQuery.data ?? [];

  const revoke = useMutation({
    mutationFn: async (assignmentId: string) =>
      client.permissions.revokeUserRole({ assignmentId }),
    onSuccess: () => {
      toast.success("Grant revoked");
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Filter by user</Label>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger size="sm" className="w-56">
              <SelectValue placeholder="All users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All users</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.name} ({m.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <GrantRoleDialog members={members} roles={roles} />
      </div>

      {assignmentsQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : assignments.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No role assignments {userFilter !== "__all__" ? "for this user" : "yet"}.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead className="w-12 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    assignment={a}
                    onRevoke={() => revoke.mutate(a.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AssignmentRow({
  assignment,
  onRevoke,
}: {
  assignment: Assignment;
  onRevoke: () => void;
}) {
  const initials = assignment.user.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const scope = assignment.environmentId
    ? "environment"
    : assignment.projectId
      ? "project"
      : "organization";

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <Avatar className="size-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{assignment.user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{assignment.user.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{assignment.roleName}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px]">
          {scope}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(assignment.createdAt).toLocaleDateString()}
        {assignment.grantedReason ? (
          <p className="truncate text-[10px]">{assignment.grantedReason}</p>
        ) : null}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button asChild variant="ghost" size="icon" title="View user activity">
            <Link href={`/activity?userId=${assignment.userId}` as never}>
              <ActivityIcon />
              <span className="sr-only">View activity</span>
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={onRevoke}>
            <Trash2 />
            <span className="sr-only">Revoke</span>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function GrantRoleDialog({ members, roles }: { members: Member[]; roles: Role[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [userId, setUserId] = React.useState<string>("");
  const [roleId, setRoleId] = React.useState<string>("");
  const [reason, setReason] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");

  const grant = useMutation({
    mutationFn: async () =>
      client.permissions.grantUserRole({
        userId,
        roleId,
        grantedReason: reason || undefined,
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
      }),
    onSuccess: () => {
      toast.success("Role granted");
      setOpen(false);
      setUserId("");
      setRoleId("");
      setReason("");
      setEndsAt("");
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Show only roles available to the current org (built-ins + org-scoped).
  const grantable = roles.filter((r) => r.isActive);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Grant role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant role</DialogTitle>
          <DialogDescription>
            Org-wide grant. For project / environment-scoped grants, use the Project page.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex flex-col gap-2">
            <Label>User</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a member" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.name} · {m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a role" />
              </SelectTrigger>
              <SelectContent>
                {grantable.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.displayName}
                    {r.isBuiltIn ? " · built-in" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="grant-reason">Reason (optional)</Label>
            <Input
              id="grant-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="On-call rotation through 2026-01"
              maxLength={200}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="grant-ends">Expires (optional)</Label>
            <Input
              id="grant-ends"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank for a permanent grant. Useful for time-bounded access.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => grant.mutate()} disabled={grant.isPending || !userId || !roleId}>
            {grant.isPending ? "Granting…" : "Grant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Building2,
  FileText,
  Fingerprint,
  Folder,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import { authClient } from "@root/lib/auth-client";
import { client } from "@root/lib/orpc/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@root/components/ui/command";

/**
 * Global Cmd-K palette.
 *
 * Sections (in order):
 *   1. Navigation — every static admin route (mirrors the sidebar).
 *   2. Quick actions — verbs that mutate state (create project, send notification, sign out).
 *   3. Projects — dynamic; resolved from `projects.list`.
 *   4. Templates — dynamic; resolved from `templates.list` of the first project.
 *
 * cmdk handles fuzzy filtering, arrow-key navigation, and the empty state.
 * Mounted globally in the admin layout; opened via `Cmd/Ctrl+K` or by
 * triggering the `command-palette:open` window event (so the header search
 * button can fire it too).
 */

interface CommandPaletteContext {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const ctx = React.createContext<CommandPaletteContext | null>(null);

export function useCommandPalette() {
  const v = React.useContext(ctx);
  if (!v) throw new Error("useCommandPalette must be used under CommandPaletteProvider");
  return v;
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = React.useMemo(() => ({ open, setOpen }), [open]);

  return (
    <ctx.Provider value={value}>
      {children}
      <CommandPaletteDialog />
    </ctx.Provider>
  );
}

interface NavCommand {
  label: string;
  hint?: string;
  icon: LucideIcon;
  href: string;
  shortcut?: string;
}

interface ActionCommand {
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => Promise<void> | void;
}

function CommandPaletteDialog() {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();

  const NAVIGATION: NavCommand[] = [
    { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", shortcut: "G D" },
    { label: "Analytics", icon: BarChart3, href: "/analytics", shortcut: "G N" },
    { label: "Activity", icon: Activity, href: "/activity", shortcut: "G A" },
    { label: "Organizations", icon: Building2, href: "/organizations" },
    { label: "Teams", icon: Users, href: "/teams" },
    { label: "Projects", icon: Folder, href: "/projects", shortcut: "G P" },
    { label: "API Keys", icon: KeyRound, href: "/api-keys" },
    { label: "Templates", icon: FileText, href: "/templates" },
    { label: "Send", icon: Send, href: "/send", shortcut: "G S" },
    { label: "Permissions", icon: ShieldCheck, href: "/permissions" },
    { label: "Passkeys", icon: Fingerprint, href: "/passkeys" },
    { label: "Devices", icon: MonitorSmartphone, href: "/devices" },
    { label: "Account", icon: Settings, href: "/account" },
    { label: "Security", icon: ShieldCheck, href: "/security" },
  ];

  const ACTIONS: ActionCommand[] = [
    {
      label: "Create new project",
      hint: "Provision a project with default envs",
      icon: Plus,
      run: () => navigate("/projects"),
    },
    {
      label: "Send notification",
      hint: "Open the composer",
      icon: Send,
      run: () => navigate("/send"),
    },
    {
      label: "Invite teammate",
      hint: "Open the Teams page",
      icon: Users,
      run: () => navigate("/teams"),
    },
    {
      label: "Toggle theme",
      hint: "Switch light / dark",
      icon: Sun,
      run: () => toggleTheme(),
    },
    {
      label: "Sign out",
      hint: "End your session",
      icon: LogOut,
      run: signOut,
    },
  ];

  // Dynamic groups — projects + templates of the first project. Queries only
  // fire when the dialog opens so the palette stays cheap on every page.
  const projectsQuery = useQuery({
    queryKey: ["projects", false],
    enabled: open,
    queryFn: async () => (await client.projects.list({ includeArchived: false })).projects,
  });
  const projects = projectsQuery.data ?? [];

  const firstProjectId = projects[0]?.id;
  const templatesQuery = useQuery({
    queryKey: ["templates", firstProjectId, "cmd-k"],
    enabled: open && !!firstProjectId,
    queryFn: async () =>
      (await client.templates.list({ projectId: firstProjectId!, includeArchived: false }))
        .templates,
  });
  const templates = templatesQuery.data ?? [];

  function navigate(href: string) {
    router.push(href as never);
    setOpen(false);
  }

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
    setOpen(false);
  }

  function toggleTheme() {
    const html = document.documentElement;
    html.classList.toggle("dark");
    setOpen(false);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Palette"
      description="Search the dashboard"
    >
      <CommandInput placeholder="Search for pages, actions, projects…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {NAVIGATION.map((nav) => (
            <CommandItem
              key={nav.href}
              value={`nav ${nav.label}`}
              onSelect={() => navigate(nav.href)}
            >
              <nav.icon />
              <span>{nav.label}</span>
              {nav.shortcut ? <CommandShortcut>{nav.shortcut}</CommandShortcut> : null}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          {ACTIONS.map((a) => (
            <CommandItem
              key={a.label}
              value={`action ${a.label} ${a.hint ?? ""}`}
              onSelect={() => a.run()}
            >
              <a.icon />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{a.label}</span>
                {a.hint ? <span className="truncate text-xs text-muted-foreground">{a.hint}</span> : null}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>

        {projects.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`project ${p.name} ${p.slug}`}
                  onSelect={() => navigate(`/projects/${p.id}`)}
                >
                  <Folder />
                  <span className="truncate">{p.name}</span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">{p.slug}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {templates.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Templates">
              {templates.slice(0, 8).map((t) => (
                <CommandItem
                  key={t.id}
                  value={`template ${t.displayName} ${t.name}`}
                  onSelect={() => navigate("/templates")}
                >
                  <FileText />
                  <span className="truncate">{t.displayName}</span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">{t.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}

import {
  LayoutDashboard,
  Building2,
  Users,
  Folder,
  KeyRound,
  Fingerprint,
  MonitorSmartphone,
  Send,
  FileText,
  Settings,
  BookOpen,
  Activity,
  ShieldCheck,
} from "lucide-react";
import type { NavGroupProps } from "./nav-group";

export const sidebarNavGroups: NavGroupProps[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Activity", url: "/activity", icon: Activity },
    ],
  },
  {
    title: "Identity",
    items: [
      { title: "Organizations", url: "/organizations", icon: Building2 },
      { title: "Teams", url: "/teams", icon: Users },
      { title: "Passkeys", url: "/passkeys", icon: Fingerprint },
      { title: "Devices", url: "/devices", icon: MonitorSmartphone },
    ],
  },
  {
    title: "Workspace",
    items: [
      { title: "Projects", url: "/projects", icon: Folder },
      { title: "API Keys", url: "/api-keys", icon: KeyRound },
      { title: "Templates", url: "/templates", icon: FileText },
      { title: "Send", url: "/send", icon: Send },
    ],
  },
  {
    title: "Settings",
    items: [
      { title: "Account", url: "/account", icon: Settings },
      { title: "Security", url: "/security", icon: ShieldCheck },
      {
        title: "Developer",
        icon: BookOpen,
        items: [
          { title: "API Reference", url: "/api" },
          { title: "OpenAPI Spec", url: "/api/spec.json" },
          { title: "RPC Endpoint", url: "/rpc" },
        ],
      },
    ],
  },
];

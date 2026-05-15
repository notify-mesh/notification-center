"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@root/components/ui/sidebar";
import { NavGroup } from "./nav-group";
import { NavUser, type NavUserData } from "./nav-user";
import { TeamSwitcher, type OrgSwitcherItem } from "./team-switcher";
import { sidebarNavGroups } from "./sidebar-data";

export interface AppSidebarProps {
  user: NavUserData;
  organizations: OrgSwitcherItem[];
  activeOrganizationId?: string | null;
}

export function AppSidebar({ user, organizations, activeOrganizationId }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        {organizations.length > 0 ? (
          <TeamSwitcher
            organizations={organizations}
            activeOrganizationId={activeOrganizationId}
          />
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/dashboard">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <Bell className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">Notification Center</span>
                    <span className="truncate text-xs">Admin Console</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarHeader>
      <SidebarContent>
        {sidebarNavGroups.map((group) => (
          <NavGroup key={group.title} {...group} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

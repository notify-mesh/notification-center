"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, type LucideIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@root/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@root/components/ui/sidebar";
import { Badge } from "@root/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@root/components/ui/dropdown-menu";

export interface NavLink {
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: string;
}

export interface NavCollapsible {
  title: string;
  icon?: LucideIcon;
  badge?: string;
  items: NavLink[];
  url?: never;
}

export type NavItem = NavLink | NavCollapsible;

export interface NavGroupProps {
  title: string;
  items: NavItem[];
}

export function NavGroup({ title, items }: NavGroupProps) {
  const { state, isMobile } = useSidebar();
  const href = usePathname() ?? "";

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const key = `${item.title}-${"url" in item ? item.url : ""}`;
          if (!("items" in item) || !item.items)
            return <SidebarMenuLink key={key} item={item as NavLink} href={href} />;
          if (state === "collapsed" && !isMobile)
            return <SidebarMenuCollapsedDropdown key={key} item={item} href={href} />;
          return <SidebarMenuCollapsible key={key} item={item} href={href} />;
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function NavBadge({ children }: { children: ReactNode }) {
  return <Badge className="rounded-full px-1 py-0 text-xs">{children}</Badge>;
}

function SidebarMenuLink({ item, href }: { item: NavLink; href: string }) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive(href, item)} tooltip={item.title}>
        <Link href={item.url as never} onClick={() => setOpenMobile(false)}>
          {item.icon ? <item.icon /> : null}
          <span>{item.title}</span>
          {item.badge ? <NavBadge>{item.badge}</NavBadge> : null}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarMenuCollapsible({ item, href }: { item: NavCollapsible; href: string }) {
  const { setOpenMobile } = useSidebar();
  return (
    <Collapsible
      asChild
      defaultOpen={item.items.some((sub) => isActive(href, sub))}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title}>
            {item.icon ? <item.icon /> : null}
            <span>{item.title}</span>
            {item.badge ? <NavBadge>{item.badge}</NavBadge> : null}
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.items.map((subItem) => (
              <SidebarMenuSubItem key={subItem.title}>
                <SidebarMenuSubButton asChild isActive={isActive(href, subItem)}>
                  <Link href={subItem.url as never} onClick={() => setOpenMobile(false)}>
                    {subItem.icon ? <subItem.icon /> : null}
                    <span>{subItem.title}</span>
                    {subItem.badge ? <NavBadge>{subItem.badge}</NavBadge> : null}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function SidebarMenuCollapsedDropdown({
  item,
  href,
}: {
  item: NavCollapsible;
  href: string;
}) {
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={item.items.some((sub) => isActive(href, sub))}
          >
            {item.icon ? <item.icon /> : null}
            <span>{item.title}</span>
            {item.badge ? <NavBadge>{item.badge}</NavBadge> : null}
            <ChevronRight className="ml-auto" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={4}>
          <DropdownMenuLabel>
            {item.title} {item.badge ? `(${item.badge})` : ""}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {item.items.map((sub) => (
            <DropdownMenuItem key={`${sub.title}-${sub.url}`} asChild>
              <Link href={sub.url as never} className={isActive(href, sub) ? "bg-secondary" : ""}>
                {sub.icon ? <sub.icon /> : null}
                <span className="max-w-52 text-wrap">{sub.title}</span>
                {sub.badge ? <span className="ml-auto text-xs">{sub.badge}</span> : null}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function isActive(href: string, item: NavLink | NavCollapsible): boolean {
  if (!("url" in item) || !item.url) return false;
  return href === item.url || href.startsWith(`${item.url}/`);
}

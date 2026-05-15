"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BadgeCheck, Bell, ChevronsUpDown, KeyRound, LogOut, MonitorSmartphone } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@root/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@root/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@root/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@root/components/ui/dialog";
import { Button } from "@root/components/ui/button";
import { authClient } from "@root/lib/auth-client";

export interface NavUserData {
  name: string;
  email: string;
  avatar?: string | null;
}

export function NavUser({ user }: { user: NavUserData }) {
  const { isMobile } = useSidebar();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function onSignOut() {
    startTransition(async () => {
      await authClient.signOut();
      setSignOutOpen(false);
      router.replace("/sign-in");
      router.refresh();
    });
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="size-8 rounded-lg">
                  {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
                  <AvatarFallback className="rounded-lg">{initials || "NC"}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8 rounded-lg">
                    {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
                    <AvatarFallback className="rounded-lg">{initials || "NC"}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/account">
                    <BadgeCheck />
                    Account
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/passkeys">
                    <KeyRound />
                    Passkeys
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/devices">
                    <MonitorSmartphone />
                    Devices
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/notifications">
                    <Bell />
                    Notifications
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setSignOutOpen(true)}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out</DialogTitle>
            <DialogDescription>
              You will be returned to the sign-in page. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSignOutOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onSignOut} disabled={pending}>
              {pending ? "Signing out…" : "Sign out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

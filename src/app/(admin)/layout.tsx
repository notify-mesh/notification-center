import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@root/lib/auth";
import { SidebarInset, SidebarProvider } from "@root/components/ui/sidebar";
import { AppSidebar } from "@root/components/layout/app-sidebar";
import { Header } from "@root/components/layout/header";
import { HeaderActions } from "./_chrome/header-actions";
import { QueryProvider } from "./_chrome/query-provider";
import { Toaster } from "@root/components/ui/sonner";
import type React from "react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect("/sign-in");

  // Pull the user's organisations and the active org id so the team-switcher
  // can render server-side without a flash. `listOrganizations` is a Better
  // Auth API exposed by the organization plugin.
  const organizations = await auth.api.listOrganizations({ headers: requestHeaders }).catch(() => []);
  const activeOrganizationId =
    (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;

  const sidebarCookie = (await cookies()).get("sidebar_state")?.value;
  const defaultOpen = sidebarCookie !== "false";

  const user = {
    name: session.user.name,
    email: session.user.email,
    avatar: session.user.image,
  };

  return (
    <QueryProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar
          user={user}
          organizations={organizations.map((o) => ({
            id: o.id,
            name: o.name,
            slug: o.slug,
            plan: "Standard",
          }))}
          activeOrganizationId={activeOrganizationId}
        />
        <SidebarInset className="@container/content">
          <Header fixed>
            <HeaderActions email={session.user.email} />
          </Header>
          {children}
        </SidebarInset>
        <Toaster position="top-right" richColors />
      </SidebarProvider>
    </QueryProvider>
  );
}

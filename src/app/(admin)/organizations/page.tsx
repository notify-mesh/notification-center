import { headers } from "next/headers";
import Link from "next/link";
import { Plus, Building2 } from "lucide-react";
import { auth } from "@root/lib/auth";
import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@root/components/ui/card";
import { Badge } from "@root/components/ui/badge";
import { Button } from "@root/components/ui/button";
import { InviteDialog } from "@root/components/invitations/invite-dialog";
import { InvitationsList } from "@root/components/invitations/invitations-list";

export default async function OrganizationsPage() {
  const requestHeaders = await headers();
  const orgs = await auth.api.listOrganizations({ headers: requestHeaders }).catch(() => []);

  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Organizations"
        description="Tenants you belong to. Each owns its own teams, projects, and API keys."
        actions={
          <>
            <InviteDialog
              trigger={
                <Button variant="outline">
                  <Plus />
                  Invite users
                </Button>
              }
            />
            <Button asChild>
              <Link href="/organizations/new">
                <Plus />
                New organization
              </Link>
            </Button>
          </>
        }
      />

      {orgs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Building2 className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No organizations yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first organization to get started.
              </p>
            </div>
            <Button asChild className="mt-2">
              <Link href="/organizations/new">
                <Plus />
                Create organization
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.map((org) => (
            <Card key={org.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="size-5" />
                  </div>
                  <Badge variant="secondary">{org.slug}</Badge>
                </div>
                <CardTitle className="mt-2">{org.name}</CardTitle>
                <CardDescription>
                  Created {new Date(org.createdAt).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between pb-6">
                <span className="text-sm text-muted-foreground">{org.id.slice(0, 12)}…</span>
                <Button asChild variant="outline" size="sm">
                  <Link href="/teams">Manage</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Pending invitations</h3>
        <InvitationsList />
      </section>
    </Main>
  );
}

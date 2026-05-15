import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { PermissionsClient } from "./permissions-client";

export default function PermissionsPage() {
  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Permissions"
        description="Roles, permissions catalog, and who-has-what across the active organization."
      />
      <PermissionsClient />
    </Main>
  );
}

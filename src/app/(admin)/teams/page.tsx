import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { TeamsClient } from "./teams-client";

export default function TeamsPage() {
  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Teams"
        description="Groups of members inside your active organization. Scope API keys and projects to a team."
      />
      <TeamsClient />
    </Main>
  );
}

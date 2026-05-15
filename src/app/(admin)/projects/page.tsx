import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { ProjectsClient } from "./projects-client";

export default function ProjectsPage() {
  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Projects"
        description="Tenant containers for templates, environments, channels, and API keys."
      />
      <ProjectsClient />
    </Main>
  );
}

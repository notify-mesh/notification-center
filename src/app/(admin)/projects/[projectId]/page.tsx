import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { ProjectDetailClient } from "./project-detail-client";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Project"
        description="Environments, active channels, and provider credentials for this project."
      />
      <ProjectDetailClient projectId={projectId} />
    </Main>
  );
}

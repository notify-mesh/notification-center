import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { TemplatesClient } from "./templates-client";

export default function TemplatesPage() {
  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Templates"
        description="Versioned content with per-channel + per-locale variants. Drafts are sendable from non-production environments only."
      />
      <TemplatesClient />
    </Main>
  );
}

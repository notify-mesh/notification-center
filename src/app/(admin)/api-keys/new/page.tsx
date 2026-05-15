import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { CreateApiKeyForm } from "./create-api-key-form";

export default function NewApiKeyPage() {
  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Issue API key"
        description="Configure restrictions and quotas. The plaintext token will be shown ONCE on creation."
      />
      <CreateApiKeyForm />
    </Main>
  );
}

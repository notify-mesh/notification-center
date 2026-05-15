import Link from "next/link";
import { Plus } from "lucide-react";
import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { Button } from "@root/components/ui/button";
import { ApiKeysClient } from "./api-keys-client";

export default function ApiKeysPage() {
  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="API Keys"
        description="Credentials your services use to call the Notification Center API. Each key is scoped to a project + environment, with optional team and rich security restrictions."
        actions={
          <Button asChild>
            <Link href="/api-keys/new">
              <Plus />
              Issue API key
            </Link>
          </Button>
        }
      />
      <ApiKeysClient />
    </Main>
  );
}

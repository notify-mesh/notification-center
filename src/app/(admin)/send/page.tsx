import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { SendClient } from "./send-client";

export default function SendPage() {
  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Send"
        description="Compose an ad-hoc notification. Routes through the DB-resolved channel stack for the selected project + environment."
      />
      <SendClient />
    </Main>
  );
}

import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { PasskeysClient } from "./passkeys-client";

export default function PasskeysPage() {
  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Passkeys"
        description="Phishing-resistant credentials linked to this account. Use them instead of a password."
      />
      <PasskeysClient />
    </Main>
  );
}

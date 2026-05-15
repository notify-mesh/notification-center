import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { DevicesClient } from "./devices-client";

export default function DevicesPage() {
  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Devices"
        description="Active sessions across your account. Review and revoke anything that doesn't look familiar."
      />
      <DevicesClient />
    </Main>
  );
}

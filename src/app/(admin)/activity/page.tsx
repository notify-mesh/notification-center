import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { ActivityClient } from "./activity-client";

export default function ActivityPage() {
  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Activity"
        description="A unified, filterable feed of authentication events and operator actions."
      />
      <ActivityClient />
    </Main>
  );
}

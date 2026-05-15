import { Suspense } from "react";
import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { ActivityClient } from "./activity-client";
import { Skeleton } from "@root/components/ui/skeleton";

export default function ActivityPage() {
  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Activity"
        description="A unified, filterable feed of authentication events and operator actions."
      />
      {/* useSearchParams() inside ActivityClient requires a Suspense boundary
          during SSG/streaming. */}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ActivityClient />
      </Suspense>
    </Main>
  );
}

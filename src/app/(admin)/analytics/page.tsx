import { Suspense } from "react";
import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { Skeleton } from "@root/components/ui/skeleton";
import { AnalyticsClient } from "./analytics-client";

export default function AnalyticsPage() {
  return (
    <Main className="flex flex-1 flex-col gap-6" fluid>
      <PageHeading
        title="Analytics"
        description="Send volume, delivery rates, costs, and failure breakdowns across the active organization. Filter by project, environment, channel, or provider; export the underlying rows to CSV."
      />
      {/* useSearchParams() requires a Suspense boundary during SSG. */}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AnalyticsClient />
      </Suspense>
    </Main>
  );
}

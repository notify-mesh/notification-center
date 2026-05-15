import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@root/components/ui/card";

export function ComingSoon({
  title,
  description,
  note,
}: {
  title: string;
  description: string;
  note: string;
}) {
  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading title={title} description={description} />
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>{note}</CardDescription>
        </CardHeader>
        <CardContent className="pb-6 text-sm text-muted-foreground">
          This area is being built. Track progress in the platform roadmap.
        </CardContent>
      </Card>
    </Main>
  );
}

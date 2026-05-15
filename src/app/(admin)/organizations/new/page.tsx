import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { Card, CardContent } from "@root/components/ui/card";
import { CreateOrganizationForm } from "./create-organization-form";

export default function NewOrganizationPage() {
  return (
    <Main className="flex flex-1 flex-col gap-6">
      <PageHeading
        title="Create organization"
        description="Spin up a new tenant. The user who creates the org becomes its owner."
      />
      <Card className="max-w-xl">
        <CardContent className="pt-6">
          <CreateOrganizationForm />
        </CardContent>
      </Card>
    </Main>
  );
}

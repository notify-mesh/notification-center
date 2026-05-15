import { Main } from "@root/components/layout/main";
import { PageHeading } from "@root/components/layout/header";
import { NotificationsClient } from "./notifications-client";

export default function NotificationsPage() {
  return (
    <Main className="flex flex-1 flex-col gap-6" fluid>
      <PageHeading
        title="Notifications"
        description="Internal messages between users. Send to teams, projects, organizations, or specific people — and track who's seen what."
      />
      <NotificationsClient />
    </Main>
  );
}

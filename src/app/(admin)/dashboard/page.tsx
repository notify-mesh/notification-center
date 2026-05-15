import { headers } from "next/headers";
import { auth } from "@root/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@root/components/ui/card";

/**
 * Admin home. Server-side reads the session straight from Better Auth — no
 * client-side flash. Replace the placeholder content with the real overview
 * widgets as they're built.
 */
export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>You are signed in as an administrator.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">Name:</span> {session?.user.name}
          </div>
          <div>
            <span className="text-muted-foreground">Email:</span> {session?.user.email}
          </div>
          <div>
            <span className="text-muted-foreground">Role:</span>{" "}
            {(session?.user as { role?: string | null })?.role ?? "user"}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>API</CardTitle>
          <CardDescription>
            Interactive reference and machine-readable spec.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /api is an oRPC handler, not a Next page */}
            <a href="/api" className="underline underline-offset-4">
              Scalar reference UI
            </a>
          </div>
          <div>
            <a href="/api/spec.json" className="underline underline-offset-4">
              OpenAPI document
            </a>
          </div>
          <div>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /rpc is an oRPC handler, not a Next page */}
            <a href="/rpc" className="underline underline-offset-4">
              RPC endpoint
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

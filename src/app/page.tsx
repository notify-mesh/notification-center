import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@root/lib/auth";

/**
 * The app has no public landing page. We just look up the session and bounce
 * the visitor to the right place. Doing this in an RSC means no
 * client-side flash.
 */
export default async function RootPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  redirect(session ? "/dashboard" : "/sign-in");
}

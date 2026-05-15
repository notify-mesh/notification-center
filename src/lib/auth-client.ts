import { createAuthClient } from "better-auth/react";
import { nextCookies } from "better-auth/next-js";
import {
  adminClient,
  multiSessionClient,
  organizationClient,
  phoneNumberClient,
  twoFactorClient,
  usernameClient,
  lastLoginMethodClient,
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

/**
 * The browser-side Better Auth SDK. Every plugin enabled on the server must
 * be mirrored here — that's how the client learns about
 *   • `authClient.signIn.phoneNumber({ phoneNumber, password })`
 *   • `authClient.phoneNumber.requestPasswordReset({ phoneNumber })`
 *   • `authClient.phoneNumber.resetPassword({ phoneNumber, otp, newPassword })`
 *   • `authClient.signOut()`
 *   • `authClient.useSession()` reactive hook
 *   • `authClient.organization.*`, `authClient.twoFactor.*`, …
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [
    nextCookies(),
    phoneNumberClient(),
    usernameClient(),
    twoFactorClient(),
    multiSessionClient(),
    organizationClient(),
    adminClient(),
    passkeyClient(),
    lastLoginMethodClient(),
  ],
});

export const { signIn, signOut, useSession, getSession, phoneNumber } = authClient;

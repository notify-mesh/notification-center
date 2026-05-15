import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import {
  admin,
  bearer,
  openAPI,
  twoFactor,
  phoneNumber,
  lastLoginMethod,
  deviceAuthorization,
  jwt,
  haveIBeenPwned,
  username,
  organization,
  multiSession,
} from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { redisClient } from "@root/lib/redis";
import { prismaDbClient } from "@root/lib/prisma";
import { sendOtpSms } from "@root/providers/sms";

const APP_NAME = "Notification Center";
const APP_URL = process.env.BETTER_AUTH_URL || "https://notification-center.local";
const TRUSTED_ORIGINS = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || APP_URL)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const RP_ID = process.env.BETTER_AUTH_RP_ID || new URL(APP_URL).hostname;

export const auth = betterAuth({
  appName: APP_NAME,
  baseURL: APP_URL,
  trustedOrigins: TRUSTED_ORIGINS,
  advanced: {
    cookiePrefix: "notification-center",
    skipTrailingSlashes: true,
    useSecureCookies: process.env.NODE_ENV === "production",
    ipAddress: {
      ipAddressHeaders: [
        "cf-connecting-ip",
        "cf-connecting-ipv6",
        "ar-real-ip",
        "fly-client-ip",
        "x-vercel-forwarded-for",
        "x-forwarded-for",
        "x-client-ip",
        "do-connecting-ip",
        "fastly-client-ip",
        "true-client-ip",
        "x-real-ip",
        "x-cluster-client-ip",
        "x-forwarded",
        "forwarded-for",
        "forwarded",
        "x-appengine-user-ip",
      ],
    },
  },
  /**
   * Redis-backed secondary storage. Session reads bypass the database
   * entirely, so RSC re-renders and oRPC's `authedProcedure` middleware
   * stay sub-millisecond on a warm cache.
   */
  secondaryStorage: {
    get: async (key) => {
      return await redisClient.get(key);
    },
    set: async (key, value, ttl) => {
      if (ttl) await redisClient.set(key, value, "EX", ttl);
      else await redisClient.set(key, value);
    },
    delete: async (key) => {
      await redisClient.del(key);
    },
  },
  database: prismaAdapter(prismaDbClient, {
    provider: "mysql",
    debugLogs: process.env.LOG_LEVEL === "debug",
    transaction: true,
  }),
  /**
   * Email/password login is enabled but admin accounts are *provisioned*
   * (no public sign-up). `disableSignUp: true` blocks the public endpoint
   * while still allowing the `admin` plugin to create users.
   */
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    autoSignIn: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh after a day of activity
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes — admin role/ban state is checked at most every 5 min
    },
  },
  plugins: [
    haveIBeenPwned({
      customPasswordCompromisedMessage:
        "The password you have chosen has been compromised in a data breach. Please choose a different password.",
    }),
    multiSession({
      maximumSessions: 3,
    }),
    organization({
      allowUserToCreateOrganization: true,
      cancelPendingInvitationsOnReInvite: true,
      dynamicAccessControl: {
        enabled: true,
        maximumRolesPerOrganization: 100,
      },
      invitationLimit: 100,
      membershipLimit: 1000,
      organizationLimit: 1_000_000,
      requireEmailVerificationOnInvitation: process.env.NODE_ENV !== "development",
      teams: {
        allowRemovingAllTeams: true,
        defaultTeam: { enabled: true },
        enabled: true,
        maximumMembersPerTeam: 1000,
        maximumTeams: 1000,
      },
    }),
    lastLoginMethod({
      cookieName: "lastLoginMethod",
      maxAge: 60 * 60 * 24 * 30,
      storeInDatabase: true,
    }),
    bearer({
      requireSignature: true,
    }),
    twoFactor({
      backupCodeOptions: {
        amount: 5,
        length: 6,
        storeBackupCodes: "encrypted",
      },
      issuer: APP_NAME,
      totpOptions: {
        backupCodes: {
          storeBackupCodes: "encrypted",
          length: 5,
          amount: 5,
        },
        digits: 6,
        disable: false,
        period: 30,
      },
    }),
    deviceAuthorization({
      deviceCodeLength: 48,
      expiresIn: "10m",
      interval: "5s",
      userCodeLength: 6,
      // Workaround for better-auth@1.6.11: the plugin's Zod options schema
      // declares `schema: z.custom(() => true)` WITHOUT .optional(), so Zod v4
      // rejects the call when the field is omitted.
      schema: {},
    }),
    admin({
      bannedUserMessage: "You are banned from using this application.",
      defaultBanReason: "Banned by an administrator.",
      impersonationSessionDuration: 60 * 60,
    }),
    passkey({
      rpID: RP_ID,
      rpName: APP_NAME,
      origin: APP_URL,
      advanced: {
        webAuthnChallengeCookie: process.env.SESSION_SECRET,
      },
    }),
    jwt({
      disableSettingJwtHeader: false,
      jwt: {
        issuer: APP_NAME,
        audience: APP_URL,
        expirationTime: "1h",
        getSubject: ({ user }) => user.id,
        definePayload: ({ user }) => ({ user: { id: user.id } }),
      },
    }),
    phoneNumber({
      allowedAttempts: 3,
      expiresIn: 180, // 3 minutes
      otpLength: 6,
      requireVerification: true,
      /**
       * Wired to the SMS provider so password-reset OTPs reach the user's
       * phone. Better Auth returns 200 here regardless of whether the phone
       * exists in the DB, so callers can't enumerate accounts.
       */
      sendPasswordResetOTP: async ({ phoneNumber, code }) => {
        await sendOtpSms({ phoneNumber, code });
      },
      sendOTP: async ({ phoneNumber, code }) => {
        await sendOtpSms({ phoneNumber, code });
      },
      signUpOnVerification: {
        getTempName: (phoneNumber) => `User ${phoneNumber}`,
        getTempEmail: (phoneNumber) => `notification-center-user-${phoneNumber}@useStrict.dev`,
      },
    }),
    username(),
    openAPI(),
  ],
});

export type Auth = typeof auth;

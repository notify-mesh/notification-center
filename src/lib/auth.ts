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
import { redisClient } from "../lib/redis";
import { prismaDbClient } from "../lib/prisma";

export const auth = betterAuth({
  advanced: {
    cookiePrefix: "notification-center",
    skipTrailingSlashes: true,
    useSecureCookies: true,
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
  appName: "Notification Center",
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
        defaultTeam: {
          enabled: true,
        },
        enabled: true,
        maximumMembersPerTeam: 1000,
        maximumTeams: 1000,
      },
      organizationHooks: {
        afterAcceptInvitation: async ({ invitation, user }) => {
          // Do something after the user accepts the invitation
          console.log(
            `User ${user.id} has accepted the invitation to organization ${invitation.organizationId}`,
          );
        },
        afterCreateOrganization: async ({ organization, user }) => {
          // Do something after the user creates the organization
          console.log(`User ${user.id} has created the organization ${organization.id}`);
        },
        afterDeleteOrganization: async ({ organization, user }) => {
          // Do something after the user deletes the organization
          console.log(`User ${user.id} has deleted the organization ${organization.id}`);
        },
        afterAddMember: async ({ member, organization, user }) => {
          // Do something after the user adds a member to the organization
          console.log(
            `User ${user.id} has added a member to organization ${organization.id} with member role ${member.role}`,
          );
        },
        afterAddTeamMember: async ({ organization, team, user, teamMember }) => {
          // Do something after the user adds a member to the team
          console.log(
            `User ${user.id} has added a member to team ${team.id} with member role ${teamMember.role} in organization ${organization.id}`,
          );
        },
        afterCreateInvitation: async ({ invitation, inviter, organization }) => {
          console.dir({
            invitation,
            inviter,
            organization,
          });
          // Do something after the user creates an invitation
          console.log(
            `User ${inviter.id} has created an invitation to organization ${invitation.organizationId}`,
          );
        },
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
      issuer: "Notification Center",
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
      deviceCodeLength: 48, // length of the device code
      expiresIn: "10m",
      interval: "5s",
      userCodeLength: 6,
    }),
    admin({
      bannedUserMessage: "You are banned from using this application.",
      defaultBanReason: "Banned by an administrator.",
      impersonationSessionDuration: 60 * 60, // 1 hour
    }),
    passkey({
      rpID: "notification-center.local",
      rpName: "Notification Center",
      origin: "https://notification-center.local",
      advanced: {
        webAuthnChallengeCookie: process.env.SESSION_SECRET,
      },
    }),
    jwt({
      disableSettingJwtHeader: false,
      jwt: {
        issuer: "Notification Center",
        audience: "https://notification-center.local",
        expirationTime: "1h",
        getSubject: ({ user }) => {
          return user.id;
        },
        definePayload: ({ user }) => {
          console.log(`User ${user.id} is about to be signed in`);
          return {
            user: {
              id: user.id,
            },
          };
        },
      },
    }),
    phoneNumber({
      allowedAttempts: 3,
      expiresIn: 180, // 3 minutes
      otpLength: 6,
      requireVerification: true,
      sendPasswordResetOTP: ({ phoneNumber, code }) => {
        console.log(`Sending OTP ${code} to phone number ${phoneNumber}`);
      },
      signUpOnVerification: {
        getTempName: (phoneNumber) => {
          return `User ${phoneNumber}`;
        },
        getTempEmail: (phoneNumber) => {
          return `notification-center-user-${phoneNumber}@useStrict.dev`;
        },
      },
      sendOTP: ({ phoneNumber, code }) => {
        console.log(`Sending OTP ${code} to phone number ${phoneNumber}`);
      },
    }),
    username(),
    openAPI(),
  ],
});

import { createHmac, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { SEED_ADMIN, SEED_DEVELOPER, SEED_VIEWER, SEED_IDS, SEED_ORG } from "../../constants";

/**
 * `PrepareMain` is the heart of the bootstrap. It is fully idempotent —
 * every write is an `upsert` keyed on a deterministic ID from `SEED_IDS`,
 * so re-running the seed after a partial failure (or after iterating on
 * roles/permissions) converges to the same end state.
 *
 * Seeded data:
 *   1. Admin user (+ developer + viewer companions) and credentials accounts
 *   2. Default Organization + 3 teams (default, payments, ops) + memberships
 *   3. CASL ACL catalog (action/subject tuples) and built-in roles
 *   4. Default Project + production/staging/development environments
 *   5. Four API keys: one per environment + one deprecated/rotated pair —
 *      each plaintext token is printed once at the end of the run
 *   6. A passkey row attached to the admin
 *   7. Auth + admin audit logs spread across the past week so the Activity
 *      page is populated immediately
 */
export async function PrepareMain(db: PrismaClient) {
  console.log("· Seeding users (admin + developer + viewer)…");
  await seedUsers(db);

  console.log("· Seeding organization, teams, members…");
  await seedOrganization(db);

  console.log("· Seeding ACL catalog & built-in roles…");
  await seedAclCatalog(db);

  console.log("· Seeding default project & environments…");
  await seedProject(db);

  console.log("· Seeding admin passkey…");
  await seedPasskey(db);

  console.log("· Seeding API keys (3 active + 1 deprecated)…");
  const apiKeyTokens = await seedApiKeys(db);

  console.log("· Seeding audit logs (auth + admin)…");
  await seedAudits(db);

  console.log("🎉 Database seeded with Notification Center demo data.");

  // Print the API-key plaintexts ONCE — they're stored as HMACs, so the
  // operator can't read them back from the DB after this.
  console.log("\nAPI key tokens (copy them — they aren't retrievable later):");
  for (const [name, token] of Object.entries(apiKeyTokens)) {
    console.log(`  ${name.padEnd(14)} ${token}`);
  }
}

// ---------------------------------------------------------------------------
// CASL ACL catalog
//
// (action, subject) is the canonical CASL tuple. "manage" + "all" form the
// platform-wide wildcard. Subjects map 1:1 to Prisma models that participate
// in authorisation; actions are the gerunds we surface in the UI.
// ---------------------------------------------------------------------------
const PERMISSIONS: Array<{
  action: string;
  subject: string;
  displayName: string;
  description?: string;
  category: string;
}> = [
  { action: "manage", subject: "all", displayName: "Manage everything", category: "Platform" },
  {
    action: "read",
    subject: "Organization",
    displayName: "View organization",
    category: "Organization",
  },
  {
    action: "update",
    subject: "Organization",
    displayName: "Update organization",
    category: "Organization",
  },
  {
    action: "delete",
    subject: "Organization",
    displayName: "Delete organization",
    category: "Organization",
  },
  { action: "read", subject: "User", displayName: "View users", category: "Identity" },
  { action: "create", subject: "User", displayName: "Invite users", category: "Identity" },
  { action: "update", subject: "User", displayName: "Update users", category: "Identity" },
  { action: "delete", subject: "User", displayName: "Remove users", category: "Identity" },
  { action: "read", subject: "Project", displayName: "View projects", category: "Projects" },
  { action: "create", subject: "Project", displayName: "Create projects", category: "Projects" },
  { action: "update", subject: "Project", displayName: "Update projects", category: "Projects" },
  { action: "delete", subject: "Project", displayName: "Delete projects", category: "Projects" },
  {
    action: "read",
    subject: "ProjectEnvironment",
    displayName: "View environments",
    category: "Projects",
  },
  {
    action: "create",
    subject: "ProjectEnvironment",
    displayName: "Create environments",
    category: "Projects",
  },
  {
    action: "update",
    subject: "ProjectEnvironment",
    displayName: "Update environments",
    category: "Projects",
  },
  {
    action: "delete",
    subject: "ProjectEnvironment",
    displayName: "Delete environments",
    category: "Projects",
  },
  { action: "read", subject: "ApiKey", displayName: "View API keys", category: "API Keys" },
  { action: "create", subject: "ApiKey", displayName: "Issue API keys", category: "API Keys" },
  { action: "rotate", subject: "ApiKey", displayName: "Rotate API keys", category: "API Keys" },
  { action: "revoke", subject: "ApiKey", displayName: "Revoke API keys", category: "API Keys" },
  { action: "reveal", subject: "ApiKey", displayName: "Reveal full API key", category: "API Keys" },
  { action: "read", subject: "Template", displayName: "View templates", category: "Notifications" },
  {
    action: "create",
    subject: "Template",
    displayName: "Create templates",
    category: "Notifications",
  },
  {
    action: "update",
    subject: "Template",
    displayName: "Update templates",
    category: "Notifications",
  },
  {
    action: "delete",
    subject: "Template",
    displayName: "Delete templates",
    category: "Notifications",
  },
  {
    action: "read",
    subject: "Notification",
    displayName: "View notifications",
    category: "Notifications",
  },
  {
    action: "send",
    subject: "Notification",
    displayName: "Send notifications",
    category: "Notifications",
  },
  {
    action: "delete",
    subject: "Notification",
    displayName: "Delete notifications",
    category: "Notifications",
  },
];

/**
 * Built-in roles — platform-wide (organizationId = null), `isBuiltIn = true`
 * so the admin UI can't accidentally delete them. The grant array is a
 * snapshot — re-runs wipe and re-link the role's permissions so this file
 * stays the single source of truth.
 */
const BUILTIN_ROLES: Array<{
  name: string;
  displayName: string;
  description: string;
  priority: number;
  grants: Array<{ action: string; subject: string }>;
}> = [
  {
    name: "owner",
    displayName: "Owner",
    description: "Full control over everything in the platform.",
    priority: 100,
    grants: [{ action: "manage", subject: "all" }],
  },
  {
    name: "admin",
    displayName: "Administrator",
    description: "Manages all platform resources except organisation deletion.",
    priority: 80,
    grants: PERMISSIONS.filter(
      (p) =>
        !(p.action === "delete" && p.subject === "Organization") &&
        !(p.action === "manage" && p.subject === "all"),
    ).map((p) => ({ action: p.action, subject: p.subject })),
  },
  {
    name: "developer",
    displayName: "Developer",
    description: "Builds and ships notifications. No identity/billing access.",
    priority: 50,
    grants: [
      { action: "read", subject: "Organization" },
      { action: "read", subject: "Project" },
      { action: "create", subject: "Project" },
      { action: "update", subject: "Project" },
      { action: "read", subject: "ProjectEnvironment" },
      { action: "create", subject: "ProjectEnvironment" },
      { action: "update", subject: "ProjectEnvironment" },
      { action: "read", subject: "ApiKey" },
      { action: "create", subject: "ApiKey" },
      { action: "rotate", subject: "ApiKey" },
      { action: "revoke", subject: "ApiKey" },
      { action: "read", subject: "Template" },
      { action: "create", subject: "Template" },
      { action: "update", subject: "Template" },
      { action: "delete", subject: "Template" },
      { action: "read", subject: "Notification" },
      { action: "send", subject: "Notification" },
    ],
  },
  {
    name: "viewer",
    displayName: "Viewer",
    description: "Read-only access to projects, templates, and notifications.",
    priority: 10,
    grants: [
      { action: "read", subject: "Organization" },
      { action: "read", subject: "Project" },
      { action: "read", subject: "ProjectEnvironment" },
      { action: "read", subject: "ApiKey" },
      { action: "read", subject: "Template" },
      { action: "read", subject: "Notification" },
    ],
  },
];

// ---------------------------------------------------------------------------
async function seedUsers(db: PrismaClient): Promise<void> {
  const now = new Date();
  const users = [
    {
      profile: SEED_ADMIN,
      userId: SEED_IDS.user,
      accountId: SEED_IDS.account,
      role: "admin" as const,
    },
    {
      profile: SEED_DEVELOPER,
      userId: SEED_IDS.userDeveloper,
      accountId: SEED_IDS.accountDeveloper,
      role: "user" as const,
    },
    {
      profile: SEED_VIEWER,
      userId: SEED_IDS.userViewer,
      accountId: SEED_IDS.accountViewer,
      role: "user" as const,
    },
  ];

  for (const u of users) {
    const passwordHash = await hashPassword(u.profile.password);

    await db.user.upsert({
      where: { id: u.userId },
      create: {
        id: u.userId,
        name: u.profile.name,
        email: u.profile.email,
        emailVerified: true,
        role: u.role,
        phoneNumber: u.profile.phone,
        phoneNumberVerified: true,
        username: u.profile.username,
        displayUsername: u.profile.username,
        locale: "fa-IR",
        timezone: "Asia/Tehran",
        isActive: true,
        passwordChangedAt: now,
        createdAt: now,
      },
      update: {
        name: u.profile.name,
        email: u.profile.email,
        role: u.role,
        phoneNumber: u.profile.phone,
        phoneNumberVerified: true,
        username: u.profile.username,
        displayUsername: u.profile.username,
        isActive: true,
        passwordChangedAt: now,
      },
    });

    // Credentials account. Better Auth identifies the password-based account
    // by `providerId = "credential"` (see better-auth/dist/api/routes/sign-up.mjs).
    await db.account.upsert({
      where: { id: u.accountId },
      create: {
        id: u.accountId,
        accountId: u.userId,
        providerId: "credential",
        userId: u.userId,
        password: passwordHash,
        createdAt: now,
      },
      update: { password: passwordHash },
    });
  }
}

async function seedOrganization(db: PrismaClient): Promise<void> {
  const now = new Date();

  await db.organization.upsert({
    where: { id: SEED_IDS.organization },
    create: {
      id: SEED_IDS.organization,
      name: SEED_ORG.name,
      slug: SEED_ORG.slug,
      createdAt: now,
      isActive: true,
      timezone: "Asia/Tehran",
      country: "IR",
    },
    update: {
      name: SEED_ORG.name,
      slug: SEED_ORG.slug,
      isActive: true,
    },
  });

  // Three teams: the catch-all "Default" + two functionally-scoped teams
  // so the Teams page has variety to display. `isActive: false` on
  // Customer Ops exercises the deactivate UI.
  const teams = [
    {
      id: SEED_IDS.team,
      name: "Default Team",
      description: "Catch-all team for unassigned work.",
      isActive: true,
    },
    {
      id: SEED_IDS.teamPayments,
      name: "Payments Engineering",
      description: "Owns the billing pipeline and payment notifications.",
      isActive: true,
    },
    {
      id: SEED_IDS.teamCustomerOps,
      name: "Customer Operations",
      description: "Legacy team — kept around for audit trail visibility.",
      isActive: false,
    },
  ];
  for (const t of teams) {
    await db.team.upsert({
      where: { id: t.id },
      create: {
        id: t.id,
        name: t.name,
        description: t.description,
        isActive: t.isActive,
        organizationId: SEED_IDS.organization,
        createdAt: now,
      },
      update: { name: t.name, description: t.description, isActive: t.isActive },
    });
  }

  // Memberships: admin is owner, developer is member, viewer is member.
  const members = [
    { id: SEED_IDS.member, userId: SEED_IDS.user, role: "owner" },
    { id: SEED_IDS.memberDeveloper, userId: SEED_IDS.userDeveloper, role: "admin" },
    { id: SEED_IDS.memberViewer, userId: SEED_IDS.userViewer, role: "member" },
  ];
  for (const m of members) {
    await db.member.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        organizationId: SEED_IDS.organization,
        userId: m.userId,
        role: m.role,
        createdAt: now,
      },
      update: { role: m.role },
    });
  }
}

async function seedAclCatalog(db: PrismaClient): Promise<void> {
  // 1. Catalog of (action, subject) tuples.
  await Promise.all(
    PERMISSIONS.map((p) =>
      db.aclPermission.upsert({
        where: { action_subject: { action: p.action, subject: p.subject } },
        create: {
          action: p.action,
          subject: p.subject,
          displayName: p.displayName,
          description: p.description,
          category: p.category,
          isBuiltIn: true,
        },
        update: {
          displayName: p.displayName,
          description: p.description,
          category: p.category,
        },
      }),
    ),
  );

  // 2. Built-in platform-wide roles.
  //
  // We can't use `upsert` here: the role table's @@unique([organizationId,
  // name]) lets `organizationId` be null, but Prisma rejects nulls inside a
  // compound unique where-clause (SQL semantics — `NULL ≠ NULL`). So we hand-roll the upsert with findFirst + branch.
  for (const role of BUILTIN_ROLES) {
    const existing = await db.aclRole.findFirst({
      where: { name: role.name, organizationId: null, isBuiltIn: true },
    });

    const dbRole = existing
      ? await db.aclRole.update({
          where: { id: existing.id },
          data: {
            displayName: role.displayName,
            description: role.description,
            priority: role.priority,
            isBuiltIn: true,
            isActive: true,
          },
        })
      : await db.aclRole.create({
          data: {
            name: role.name,
            displayName: role.displayName,
            description: role.description,
            organizationId: null,
            isBuiltIn: true,
            isActive: true,
            priority: role.priority,
          },
        });

    // 3. Re-link permissions: wipe existing role-permission rows and re-grant
    // from the source-of-truth `BUILTIN_ROLES` array. Keeps the role honest
    // if a grant was removed in code since the previous seed run.
    await db.aclRolePermission.deleteMany({ where: { roleId: dbRole.id } });

    for (const grant of role.grants) {
      const perm = await db.aclPermission.findUnique({
        where: { action_subject: { action: grant.action, subject: grant.subject } },
      });
      if (!perm) continue;
      await db.aclRolePermission.create({
        data: {
          roleId: dbRole.id,
          permissionId: perm.id,
          inverted: false,
        },
      });
    }
  }

  // 4. Assign the platform-owner role to the seeded admin.
  //
  // AclUserRole has @@unique([userId, roleId, organizationId, projectId,
  // environmentId]) — three of those columns are nullable, so the same
  // null-in-compound-unique restriction applies. findFirst + create-if-absent.
  const ownerRole = await db.aclRole.findFirst({
    where: { name: "owner", organizationId: null },
  });
  if (ownerRole) {
    const existingGrant = await db.aclUserRole.findFirst({
      where: {
        userId: SEED_IDS.user,
        roleId: ownerRole.id,
        organizationId: null,
        projectId: null,
        environmentId: null,
      },
    });
    if (!existingGrant) {
      await db.aclUserRole.create({
        data: {
          userId: SEED_IDS.user,
          roleId: ownerRole.id,
          grantedReason: "Platform bootstrap (seed)",
        },
      });
    }
  }
}

async function seedProject(db: PrismaClient): Promise<void> {
  await db.project.upsert({
    where: { id: SEED_IDS.project },
    create: {
      id: SEED_IDS.project,
      name: "Default Project",
      slug: "default",
      description: "Sandbox project created by the seed.",
      organizationId: SEED_IDS.organization,
      createdById: SEED_IDS.user,
      isActive: true,
      dataRegion: "ir-tehran",
      retentionDays: 30,
    },
    update: {
      name: "Default Project",
      description: "Sandbox project created by the seed.",
    },
  });

  const envs = [
    { id: SEED_IDS.envProd, name: "production", isDefault: true },
    { id: SEED_IDS.envStaging, name: "staging", isDefault: false },
    { id: SEED_IDS.envDev, name: "development", isDefault: false },
  ];

  for (const env of envs) {
    await db.projectEnvironment.upsert({
      where: { id: env.id },
      create: {
        id: env.id,
        name: env.name,
        projectId: SEED_IDS.project,
        isDefault: env.isDefault,
        isActive: true,
        settings: {
          defaultChannels: ["sms"],
          defaultLocale: "fa-IR",
        },
      },
      update: {
        name: env.name,
        isDefault: env.isDefault,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Passkey + API keys + audit logs — the heavy parts of the demo dataset.
// ---------------------------------------------------------------------------

/**
 * Seed a fake passkey row attached to the admin. The credential won't actually
 * work for sign-in (we don't possess the matching private key) but it's
 * enough to populate the dashboard and exercise the AAGUID resolver.
 *
 * AAGUID picked is Apple iCloud Keychain so the UI shows a recognisable
 * vendor + icon out of the box.
 */
async function seedPasskey(db: PrismaClient): Promise<void> {
  await db.passkey.upsert({
    where: { id: SEED_IDS.passkey },
    create: {
      id: SEED_IDS.passkey,
      name: "MacBook · Touch ID",
      publicKey: randomBytes(64).toString("base64"),
      credentialID: randomBytes(20).toString("base64url"),
      counter: 0,
      deviceType: "multiDevice",
      backedUp: true,
      transports: "internal,hybrid",
      aaguid: "adce0002-35bc-c60a-648b-0b25f1f05503",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
      userId: SEED_IDS.user,
    },
    update: { name: "MacBook · Touch ID" },
  });
}

/**
 * Mint an API key with a real HMAC pair so it would actually authenticate
 * (we just don't expose the plaintext anywhere except the seed log).
 */
const PEPPER = process.env.API_KEY_PEPPER || process.env.SESSION_SECRET || "dev-pepper";

function mintToken(envSlug: string): { token: string; keyPrefix: string; keyHash: string } {
  const random = randomBytes(24).toString("base64url");
  const token = `nc_${envSlug}_${random}`;
  return {
    token,
    keyPrefix: token.slice(0, 8),
    keyHash: createHmac("sha256", PEPPER).update(token).digest("hex"),
  };
}

async function seedApiKeys(db: PrismaClient): Promise<Record<string, string>> {
  const now = new Date();
  const tokens: Record<string, string> = {};

  // Active key per environment, each with a different restriction profile.
  const keys: Array<{
    id: string;
    name: string;
    description: string;
    envId: string;
    envName: string;
    teamId: string | null;
    canWrite: boolean;
    scopes: string[];
    ipRestrictions: string[];
    countryRestrictions: string[];
    websiteOrigins: string[];
    rateLimitPerSecond: number;
    dailyQuota: number | null;
    monthlyQuota: number | null;
    requireHttps: boolean;
    tags: string[];
  }> = [
    {
      id: SEED_IDS.apiKeyProd,
      name: "Production · Payments service",
      description: "Issued to the payments backend; restricted to corporate IPs.",
      envId: SEED_IDS.envProd,
      envName: "prod",
      teamId: SEED_IDS.teamPayments,
      canWrite: true,
      scopes: ["sms.send", "templates.read", "notifications.read"],
      ipRestrictions: ["203.0.113.0/24"],
      countryRestrictions: ["IR"],
      websiteOrigins: [],
      rateLimitPerSecond: 50,
      dailyQuota: 100_000,
      monthlyQuota: 2_000_000,
      requireHttps: true,
      tags: ["prod", "payments", "mission-critical"],
    },
    {
      id: SEED_IDS.apiKeyStaging,
      name: "Staging · CI key",
      description: "Used by CI to smoke-test sends against staging.",
      envId: SEED_IDS.envStaging,
      envName: "staging",
      teamId: null,
      canWrite: true,
      scopes: ["sms.send"],
      ipRestrictions: [],
      countryRestrictions: [],
      websiteOrigins: ["https://staging.notification-center.local"],
      rateLimitPerSecond: 10,
      dailyQuota: 5_000,
      monthlyQuota: 100_000,
      requireHttps: false,
      tags: ["staging", "ci"],
    },
    {
      id: SEED_IDS.apiKeyDev,
      name: "Development · Local",
      description: "Loose-restriction key for local development.",
      envId: SEED_IDS.envDev,
      envName: "dev",
      teamId: SEED_IDS.team,
      canWrite: true,
      scopes: ["sms.send", "templates.read", "templates.write", "notifications.read"],
      ipRestrictions: [],
      countryRestrictions: [],
      websiteOrigins: [],
      rateLimitPerSecond: 100,
      dailyQuota: null,
      monthlyQuota: null,
      requireHttps: false,
      tags: ["dev"],
    },
  ];

  for (const k of keys) {
    const { token, keyPrefix, keyHash } = mintToken(k.envName);
    tokens[k.name] = token;
    await db.apiKey.upsert({
      where: { id: k.id },
      create: {
        id: k.id,
        name: k.name,
        description: k.description,
        keyHash,
        keyPrefix,
        organizationId: SEED_IDS.organization,
        projectId: SEED_IDS.project,
        environmentId: k.envId,
        teamId: k.teamId,
        userId: SEED_IDS.user,
        isActive: true,
        canRead: true,
        canWrite: k.canWrite,
        scopes: k.scopes,
        ipRestrictions: k.ipRestrictions,
        countryRestrictions: k.countryRestrictions,
        websiteOrigins: k.websiteOrigins,
        allowedMethods: k.canWrite ? ["GET", "POST", "PATCH", "DELETE"] : ["GET"],
        requireHttps: k.requireHttps,
        rateLimitPerSecond: k.rateLimitPerSecond,
        dailyQuota: k.dailyQuota,
        monthlyQuota: k.monthlyQuota,
        tags: k.tags,
        createdAt: now,
      },
      update: { keyHash, keyPrefix },
    });
  }

  // Deprecated/rotated key — same prod environment, marked `deprecatedAt`
  // and with a short remaining lifetime so the Active-keys table shows the
  // "Deprecated" badge variant.
  const deprecated = mintToken("prod");
  tokens["Deprecated · Old prod key"] = deprecated.token;
  await db.apiKey.upsert({
    where: { id: SEED_IDS.apiKeyDeprecated },
    create: {
      id: SEED_IDS.apiKeyDeprecated,
      name: "Production · Old payments key",
      description: "Rolled over to the new prod key on 2024-01-15.",
      keyHash: deprecated.keyHash,
      keyPrefix: deprecated.keyPrefix,
      organizationId: SEED_IDS.organization,
      projectId: SEED_IDS.project,
      environmentId: SEED_IDS.envProd,
      teamId: SEED_IDS.teamPayments,
      userId: SEED_IDS.user,
      isActive: true,
      canRead: true,
      canWrite: true,
      scopes: ["sms.send"],
      ipRestrictions: [],
      countryRestrictions: ["IR"],
      websiteOrigins: [],
      allowedMethods: ["GET", "POST"],
      requireHttps: true,
      rateLimitPerSecond: 50,
      dailyQuota: 100_000,
      monthlyQuota: 2_000_000,
      tags: ["prod", "deprecated"],
      deprecatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5),
      rotatedFromKeyId: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
    },
    update: {
      keyHash: deprecated.keyHash,
      keyPrefix: deprecated.keyPrefix,
    },
  });

  return tokens;
}

/**
 * Seed a week's worth of audit events so the Activity page has texture.
 *
 * Layout:
 *   - 8 auth events spread across users (admin sign-in/passkey/2FA,
 *     developer sign-in, viewer rate-limited)
 *   - 6 admin actions (org/project/team/api-key lifecycle)
 *   - `createdAt` is staggered so the timeline reads naturally
 */
async function seedAudits(db: PrismaClient): Promise<void> {
  const now = Date.now();
  const minutesAgo = (n: number) => new Date(now - n * 60_000);
  const hoursAgo = (n: number) => new Date(now - n * 3_600_000);
  const daysAgo = (n: number) => new Date(now - n * 86_400_000);

  // ---- AuthAuditLog rows --------------------------------------------------
  type AuthRow = Parameters<typeof db.authAuditLog.create>[0]["data"];
  const authEvents: AuthRow[] = [
    {
      userId: SEED_IDS.user,
      action: "SIGN_IN",
      outcome: "SUCCESS",
      method: "passkey",
      identifier: SEED_ADMIN.email,
      identifierKind: "email",
      ipAddress: "203.0.113.42",
      country: "IR",
      city: "Tehran",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
      sessionId: SEED_IDS.session,
      riskScore: 5,
      riskFactors: [],
      createdAt: minutesAgo(15),
    },
    {
      userId: SEED_IDS.user,
      action: "PASSKEY_AUTHENTICATE",
      outcome: "SUCCESS",
      method: "passkey",
      identifier: SEED_ADMIN.email,
      identifierKind: "email",
      ipAddress: "203.0.113.42",
      country: "IR",
      city: "Tehran",
      sessionId: SEED_IDS.session,
      riskScore: 5,
      createdAt: minutesAgo(15),
    },
    {
      userId: SEED_IDS.user,
      action: "TWO_FACTOR_VERIFY",
      outcome: "SUCCESS",
      method: "totp",
      identifier: SEED_ADMIN.email,
      ipAddress: "203.0.113.42",
      country: "IR",
      createdAt: hoursAgo(6),
    },
    {
      userId: SEED_IDS.userDeveloper,
      action: "SIGN_IN",
      outcome: "SUCCESS",
      method: "credential",
      identifier: SEED_DEVELOPER.phone,
      identifierKind: "phone",
      ipAddress: "198.51.100.12",
      country: "IR",
      city: "Shiraz",
      riskScore: 10,
      createdAt: hoursAgo(12),
    },
    {
      userId: SEED_IDS.userViewer,
      action: "SIGN_IN",
      outcome: "FAILURE",
      reason: "Invalid password",
      method: "credential",
      identifier: SEED_VIEWER.phone,
      identifierKind: "phone",
      ipAddress: "198.51.100.55",
      country: "IR",
      riskScore: 45,
      riskFactors: ["new_device"],
      createdAt: hoursAgo(20),
    },
    {
      userId: SEED_IDS.userViewer,
      action: "RATE_LIMITED",
      outcome: "BLOCKED",
      reason: "Too many sign-in attempts",
      identifier: SEED_VIEWER.phone,
      identifierKind: "phone",
      ipAddress: "198.51.100.55",
      country: "IR",
      riskScore: 75,
      riskFactors: ["new_device", "rapid_attempts"],
      createdAt: hoursAgo(20),
    },
    {
      userId: SEED_IDS.user,
      action: "PASSKEY_REGISTER",
      outcome: "SUCCESS",
      method: "passkey",
      identifier: SEED_ADMIN.email,
      ipAddress: "203.0.113.42",
      country: "IR",
      metadata: { authenticator: "Apple iCloud Keychain" },
      createdAt: daysAgo(3),
    },
    {
      userId: SEED_IDS.user,
      action: "PASSWORD_CHANGE",
      outcome: "SUCCESS",
      identifier: SEED_ADMIN.email,
      ipAddress: "203.0.113.42",
      country: "IR",
      createdAt: daysAgo(5),
    },
  ];
  for (const row of authEvents) {
    await db.authAuditLog.create({ data: row });
  }

  // ---- AdminAuditLog rows -------------------------------------------------
  type AdminRow = Parameters<typeof db.adminAuditLog.create>[0]["data"];
  const adminEvents: AdminRow[] = [
    {
      actorUserId: SEED_IDS.user,
      actorEmail: SEED_ADMIN.email,
      action: "organization.create",
      targetType: "organization",
      targetId: SEED_IDS.organization,
      targetLabel: SEED_ORG.slug,
      organizationId: SEED_IDS.organization,
      after: { name: SEED_ORG.name, slug: SEED_ORG.slug },
      severity: "INFO",
      ipAddress: "203.0.113.42",
      createdAt: daysAgo(7),
    },
    {
      actorUserId: SEED_IDS.user,
      actorEmail: SEED_ADMIN.email,
      action: "project.create",
      targetType: "project",
      targetId: SEED_IDS.project,
      targetLabel: "default",
      organizationId: SEED_IDS.organization,
      projectId: SEED_IDS.project,
      after: { name: "Default Project", dataRegion: "ir-tehran" },
      severity: "INFO",
      createdAt: daysAgo(7),
    },
    {
      actorUserId: SEED_IDS.user,
      actorEmail: SEED_ADMIN.email,
      action: "team.create",
      targetType: "team",
      targetId: SEED_IDS.teamPayments,
      targetLabel: "Payments Engineering",
      organizationId: SEED_IDS.organization,
      after: { name: "Payments Engineering", isActive: true },
      severity: "INFO",
      createdAt: daysAgo(6),
    },
    {
      actorUserId: SEED_IDS.user,
      actorEmail: SEED_ADMIN.email,
      action: "apikey.create",
      targetType: "apikey",
      targetId: SEED_IDS.apiKeyProd,
      targetLabel: "Production · Payments service",
      organizationId: SEED_IDS.organization,
      projectId: SEED_IDS.project,
      environmentId: SEED_IDS.envProd,
      after: {
        scopes: ["sms.send", "templates.read"],
        ipRestrictions: ["203.0.113.0/24"],
        rateLimitPerSecond: 50,
      },
      severity: "INFO",
      freshSession: true,
      createdAt: daysAgo(2),
    },
    {
      actorUserId: SEED_IDS.user,
      actorEmail: SEED_ADMIN.email,
      action: "apikey.rotate",
      targetType: "apikey",
      targetId: SEED_IDS.apiKeyDeprecated,
      targetLabel: "Production · Old payments key",
      organizationId: SEED_IDS.organization,
      projectId: SEED_IDS.project,
      environmentId: SEED_IDS.envProd,
      before: { deprecatedAt: null },
      after: { deprecatedAt: new Date().toISOString(), gracePeriodHours: 168 },
      reason: "Quarterly rotation policy",
      severity: "WARN",
      freshSession: true,
      createdAt: daysAgo(2),
    },
    {
      actorUserId: SEED_IDS.user,
      actorEmail: SEED_ADMIN.email,
      action: "team.deactivate",
      targetType: "team",
      targetId: SEED_IDS.teamCustomerOps,
      targetLabel: "Customer Operations",
      organizationId: SEED_IDS.organization,
      before: { isActive: true },
      after: { isActive: false },
      reason: "Team disbanded — kept for audit history.",
      severity: "INFO",
      createdAt: hoursAgo(8),
    },
  ];
  for (const row of adminEvents) {
    await db.adminAuditLog.create({ data: row });
  }
}

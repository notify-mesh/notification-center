import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { SEED_ADMIN, SEED_IDS, SEED_ORG } from "../../constants";

/**
 * `PrepareMain` is the heart of the bootstrap. It is fully idempotent —
 * every writing is an `upsert` keyed on a deterministic ID from `SEED_IDS`,
 * so re-running the seed after a partial failure (or after iterating on
 * roles/permissions) converges to the same end state.
 *
 * Seeded data:
 *   1. Admin user and credentials Account (Better Auth `providerId = "credential"`)
 *   2. Default Organization + Team + owner Member row
 *   3. CASL ACL catalog (action/subject tuples)
 *   4. Built-in platform roles (owner/admin/developer/viewer) and grants
 *   5. Default Project and production/staging/development environments
 */
export async function PrepareMain(db: PrismaClient) {
  console.log("· Seeding admin user…");
  await seedAdminUser(db);

  console.log("· Seeding organization, team, member…");
  await seedOrganization(db);

  console.log("· Seeding ACL catalog & built-in roles…");
  await seedAclCatalog(db);

  console.log("· Seeding default project & environments…");
  await seedProject(db);

  console.log("🎉 Database seeded with Notification Center bootstrap data.");
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
async function seedAdminUser(db: PrismaClient): Promise<void> {
  const now = new Date();
  const passwordHash = await hashPassword(SEED_ADMIN.password);

  // 1. User record.
  await db.user.upsert({
    where: { id: SEED_IDS.user },
    create: {
      id: SEED_IDS.user,
      name: SEED_ADMIN.name,
      email: SEED_ADMIN.email,
      emailVerified: true,
      role: "admin",
      phoneNumber: SEED_ADMIN.phone,
      phoneNumberVerified: true,
      username: SEED_ADMIN.username,
      displayUsername: SEED_ADMIN.username,
      locale: "fa-IR",
      timezone: "Asia/Tehran",
      isActive: true,
      passwordChangedAt: now,
      createdAt: now,
    },
    update: {
      name: SEED_ADMIN.name,
      email: SEED_ADMIN.email,
      role: "admin",
      phoneNumber: SEED_ADMIN.phone,
      phoneNumberVerified: true,
      username: SEED_ADMIN.username,
      displayUsername: SEED_ADMIN.username,
      isActive: true,
      passwordChangedAt: now,
    },
  });

  // 2. Credentials account. Better Auth identifies the password-based account
  // by `providerId = "credential"` (see better-auth/dist/api/routes/sign-up.mjs).
  await db.account.upsert({
    where: { id: SEED_IDS.account },
    create: {
      id: SEED_IDS.account,
      accountId: SEED_IDS.user,
      providerId: "credential",
      userId: SEED_IDS.user,
      password: passwordHash,
      createdAt: now,
    },
    update: {
      password: passwordHash,
    },
  });
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

  await db.team.upsert({
    where: { id: SEED_IDS.team },
    create: {
      id: SEED_IDS.team,
      name: "Default Team",
      organizationId: SEED_IDS.organization,
      createdAt: now,
    },
    update: { name: "Default Team" },
  });

  await db.member.upsert({
    where: { id: SEED_IDS.member },
    create: {
      id: SEED_IDS.member,
      organizationId: SEED_IDS.organization,
      userId: SEED_IDS.user,
      role: "owner",
      createdAt: now,
    },
    update: { role: "owner" },
  });
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

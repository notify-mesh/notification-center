import { PrismaClient } from "@prisma/client";
import { SEED_IDS } from "../constants";

/**
 * Reverses `PrepareMain` by deleting only the rows that share the
 * deterministic seed IDs (plus the built-in CASL catalog, which is
 * identifiable by its `isBuiltIn` flag + platform-wide scope).
 *
 *   bun run db:seed -- --prune
 *   bun run db:seed -- --prune --users    # only the seeded users + auth rows
 */
export async function PruneDatabaseSeed(db: PrismaClient) {
  const args = process.argv.slice(2);
  const excluded: Array<string> = [];
  const isExcluded = (seed: string) => excluded.includes(seed);
  if (args.includes("--exclude=users")) {
    excluded.push("users");
  }

  const onlyUsers = args.includes("--users");
  if (onlyUsers) {
    await pruneUsers(db);
    return;
  }

  console.log("Pruning all seed data…");
  await pruneAudits(db);
  await pruneApiKeys(db);
  await pruneAcl(db);
  await pruneProject(db);
  await pruneOrganization(db);
  if (!isExcluded("users")) {
    await pruneUsers(db);
  }
  console.log("Pruned all seed data 🎉");
}

// IDs we own. Anything else stays untouched.
const USER_IDS = [SEED_IDS.user, SEED_IDS.userDeveloper, SEED_IDS.userViewer];
const ACCOUNT_IDS = [SEED_IDS.account, SEED_IDS.accountDeveloper, SEED_IDS.accountViewer];
const MEMBER_IDS = [SEED_IDS.member, SEED_IDS.memberDeveloper, SEED_IDS.memberViewer];
const TEAM_IDS = [SEED_IDS.team, SEED_IDS.teamPayments, SEED_IDS.teamCustomerOps];
const API_KEY_IDS = [
  SEED_IDS.apiKeyProd,
  SEED_IDS.apiKeyStaging,
  SEED_IDS.apiKeyDev,
  SEED_IDS.apiKeyDeprecated,
];

async function pruneAudits(db: PrismaClient): Promise<void> {
  console.log("· Pruning audit logs (auth + admin)…");
  await db.authAuditLog.deleteMany({ where: { userId: { in: USER_IDS } } });
  await db.adminAuditLog.deleteMany({ where: { actorUserId: { in: USER_IDS } } });
}

async function pruneApiKeys(db: PrismaClient): Promise<void> {
  console.log("· Pruning API keys…");
  await db.apiKey.deleteMany({ where: { id: { in: API_KEY_IDS } } });
}

async function pruneAcl(db: PrismaClient): Promise<void> {
  console.log("· Pruning ACL grants, roles, and permission catalog…");
  await db.aclUserRole.deleteMany({ where: { userId: { in: USER_IDS } } });
  await db.aclRolePermission.deleteMany({
    where: { role: { isBuiltIn: true, organizationId: null } },
  });
  await db.aclRole.deleteMany({ where: { isBuiltIn: true, organizationId: null } });
  await db.aclPermission.deleteMany({ where: { isBuiltIn: true } });
}

async function pruneProject(db: PrismaClient): Promise<void> {
  console.log("· Pruning default project & environments…");
  await db.projectEnvironment.deleteMany({
    where: { id: { in: [SEED_IDS.envProd, SEED_IDS.envStaging, SEED_IDS.envDev] } },
  });
  await db.project.deleteMany({ where: { id: SEED_IDS.project } });
}

async function pruneOrganization(db: PrismaClient): Promise<void> {
  console.log("· Pruning organization, teams, members…");
  await db.member.deleteMany({ where: { id: { in: MEMBER_IDS } } });
  await db.team.deleteMany({ where: { id: { in: TEAM_IDS } } });
  await db.organization.deleteMany({ where: { id: SEED_IDS.organization } });
}

async function pruneUsers(db: PrismaClient): Promise<void> {
  // Better Auth's session state lives in Redis (secondaryStorage), so no
  // Session row to clean up here — just users, accounts, and passkeys.
  console.log("· Pruning users, accounts, passkeys…");
  await db.passkey.deleteMany({ where: { userId: { in: USER_IDS } } });
  await db.account.deleteMany({ where: { id: { in: ACCOUNT_IDS } } });
  await db.user.deleteMany({ where: { id: { in: USER_IDS } } });
}

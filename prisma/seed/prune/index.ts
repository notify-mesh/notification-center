import { PrismaClient } from "@prisma/client";
import { SEED_IDS } from "../constants";

/**
 * Reverses `PrepareMain` by deleting only the rows that share the
 * deterministic seed IDs (plus the built-in CASL catalog, which is
 * identifiable by its `isBuiltIn` flag + platform-wide scope).
 *
 *   bun run db:seed -- --prune
 *   bun run db:seed -- --prune --users    # subset (future: only the admin user)
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
  await pruneAcl(db);
  await pruneProject(db);
  await pruneOrganization(db);
  if (!isExcluded("users")) {
    await pruneUsers(db);
  }
  console.log("Pruned all seed data 🎉");
}

async function pruneAcl(db: PrismaClient): Promise<void> {
  console.log("· Pruning ACL grants, roles, and permission catalog…");

  // Order: user-role grants → role-permission grants → roles → permissions.
  // FK cascades would cover most of this, but explicit deletes are easier to
  // reason about when running on a half-seeded database.
  await db.aclUserRole.deleteMany({ where: { userId: SEED_IDS.user } });
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
  console.log("· Pruning organization, team, member…");
  await db.member.deleteMany({ where: { id: SEED_IDS.member } });
  await db.team.deleteMany({ where: { id: SEED_IDS.team } });
  await db.organization.deleteMany({ where: { id: SEED_IDS.organization } });
}

async function pruneUsers(db: PrismaClient): Promise<void> {
  console.log("· Pruning admin user & credentials account…");
  await db.account.deleteMany({ where: { id: SEED_IDS.account } });
  await db.user.deleteMany({ where: { id: SEED_IDS.user } });
}

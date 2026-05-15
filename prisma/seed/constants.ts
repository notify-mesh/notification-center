/**
 * Deterministic IDs shared between the prepare and prune passes.
 *
 * Better Auth's tables (User, Account, Member, Organization, Team) declare
 * `id` as `String @id` with no Prisma default, so the seed has to provide
 * them. Using stable string IDs makes prepare idempotent (upsert key) and
 * makes prune trivial (delete by these exact IDs).
 */
export const SEED_IDS = {
  user: "seed-admin-001",
  account: "seed-admin-account-001",
  organization: "seed-org-001",
  team: "seed-team-001",
  member: "seed-member-001",
  project: "seed-project-001",
  envProd: "seed-env-prod-001",
  envStaging: "seed-env-staging-001",
  envDev: "seed-env-dev-001",
} as const;

export const SEED_ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL ?? "admin@notification-center.local",
  phone: process.env.SEED_ADMIN_PHONE ?? "+989120000000",
  name: process.env.SEED_ADMIN_NAME ?? "Platform Administrator",
  username: process.env.SEED_ADMIN_USERNAME ?? "admin",
  password: process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!123",
} as const;

export const SEED_ORG = {
  slug: process.env.SEED_ORG_SLUG ?? "notification-center",
  name: process.env.SEED_ORG_NAME ?? "Notification Center",
} as const;

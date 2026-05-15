/**
 * Deterministic IDs shared between the prepare and prune passes.
 *
 * Better Auth's tables (User, Account, Member, Organization, Team) declare
 * `id` as `String @id` with no Prisma default, so the seed has to provide
 * them. Using stable string IDs makes prepare idempotent (upsert key) and
 * makes prune trivial (delete by these exact IDs).
 */
export const SEED_IDS = {
  // Primary admin
  user: "seed-admin-001",
  account: "seed-admin-account-001",
  passkey: "seed-passkey-001",
  session: "seed-session-001",

  // Secondary users (for activity / team variety)
  userDeveloper: "seed-user-dev-001",
  accountDeveloper: "seed-account-dev-001",
  userViewer: "seed-user-viewer-001",
  accountViewer: "seed-account-viewer-001",

  // Org structure
  organization: "seed-org-001",
  team: "seed-team-001",
  teamPayments: "seed-team-payments-001",
  teamCustomerOps: "seed-team-ops-001",
  member: "seed-member-001",
  memberDeveloper: "seed-member-dev-001",
  memberViewer: "seed-member-viewer-001",

  // Project + environments
  project: "seed-project-001",
  envProd: "seed-env-prod-001",
  envStaging: "seed-env-staging-001",
  envDev: "seed-env-dev-001",

  // API keys (one per environment + a deprecated rotated pair)
  apiKeyProd: "seed-key-prod-001",
  apiKeyStaging: "seed-key-staging-001",
  apiKeyDev: "seed-key-dev-001",
  apiKeyDeprecated: "seed-key-deprecated-001",
} as const;

export const SEED_ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL ?? "admin@notification-center.local",
  phone: process.env.SEED_ADMIN_PHONE ?? "+989120000000",
  name: process.env.SEED_ADMIN_NAME ?? "Platform Administrator",
  username: process.env.SEED_ADMIN_USERNAME ?? "admin",
  password: process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!123",
} as const;

export const SEED_DEVELOPER = {
  email: "developer@notification-center.local",
  phone: "+989120000001",
  name: "Sara Developer",
  username: "sara",
  password: "ChangeMe!123",
} as const;

export const SEED_VIEWER = {
  email: "viewer@notification-center.local",
  phone: "+989120000002",
  name: "Reza Viewer",
  username: "reza",
  password: "ChangeMe!123",
} as const;

export const SEED_ORG = {
  slug: process.env.SEED_ORG_SLUG ?? "notification-center",
  name: process.env.SEED_ORG_NAME ?? "Notification Center",
} as const;

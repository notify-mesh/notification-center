import * as env from "dotenv";
import { resolve } from "node:path";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
// Seeds
import { PrepareDatabase } from "./seed/prepare";
import { PruneDatabaseSeed } from "./seed/prune";
import { SEED_ADMIN } from "./seed/constants";

env.config({ path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), ".env.local")] });

const args = process.argv.slice(2);

/**
 * Top-level seed dispatcher. Owns nothing but database connection, CLI
 * routing, and the post-run report. Every piece of domain data lives under
 * `./seed/prepare/<pack>/` so adding a new pack (e.g. demo notifications,
 * test API keys) means dropping in a folder, not editing this file.
 *
 *   bun run db:seed                # prepare (default)
 *   bun run db:seed -- --prepare   # explicit prepare
 *   bun run db:seed -- --prune     # delete seeded rows
 *   bun run db:seed -- --prune --prepare    # wipe-then-reseed
 */
const main = async () => {
  const adapter = new PrismaMariaDb({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    user: process.env.DB_USERNAME || "root",
    password: process.env.DB_PASSWORD || "pass123",
    database: process.env.DB_DATABASE || "notification_center",
    ssl: process.env.DB_SSL === "true",
    timezone: "Asia/Tehran",
    autoJsonMap: true,
    bigIntAsNumber: true,
  });

  const db = new PrismaClient({ adapter, errorFormat: "pretty" });

  try {
    // Default behaviour (no flags) is to prepare.
    const wantsPrune = args.includes("--prune");
    const wantsPrepare = args.includes("--prepare") || !wantsPrune;

    if (wantsPrune) {
      await PruneDatabaseSeed(db);
    }
    if (wantsPrepare) {
      await PrepareDatabase(db);
    }
  } finally {
    await db.$disconnect();
  }
};

main()
  .then(() => {
    console.log("\nNotification Center seed completed ✅");
    console.log(`  Admin email:    ${SEED_ADMIN.email}`);
    console.log(`  Admin phone:    ${SEED_ADMIN.phone}`);
    console.log(`  Admin username: ${SEED_ADMIN.username}`);
    console.log(`  Admin password: ${SEED_ADMIN.password}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

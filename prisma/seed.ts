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
 * Top-level seed dispatcher.
 *
 * Defaults
 * --------
 * Running without flags performs a **reset-then-seed**: every row this seed
 * owns (identified by deterministic IDs) is removed first, then the full
 * fake-data pack is re-created. This avoids unique-key collisions on re-runs
 * and gives a fresh, deterministic starting point.
 *
 * Flags
 * -----
 *   bun run db:seed                       # reset + reseed (default)
 *   bun run db:seed -- --prepare          # seed only — don't prune first
 *   bun run db:seed -- --prune            # prune only
 *   bun run db:seed -- --no-reset         # alias of --prepare
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
    const wantsPrune = args.includes("--prune");
    const wantsPrepareOnly = args.includes("--prepare") || args.includes("--no-reset");
    const wantsPrepare = wantsPrepareOnly || !wantsPrune;
    // Default behaviour: wipe-then-seed unless the caller explicitly opted
    // out of the prune step.
    const shouldPrune = wantsPrune || (!wantsPrepareOnly && wantsPrepare);

    if (shouldPrune) {
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

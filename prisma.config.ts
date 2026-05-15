import * as env from "dotenv";
import { expand } from "dotenv-expand";
import { resolve, join } from "node:path";
// Types
import type { PrismaConfig } from "prisma";

expand(
  env.config({
    path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), ".env.local")],
  }),
);

export default {
  schema: join("prisma/schema"),
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    // Run with Bun directly: prisma/seed.ts pulls in `better-auth/crypto` for
    // password hashing, and Better Auth is ESM-only — ts-node with the legacy
    // `module: commonjs` setup in prisma/tsconfig.json refuses to load it.
    seed: "bun --bun prisma/seed.ts",
  },
} satisfies PrismaConfig;

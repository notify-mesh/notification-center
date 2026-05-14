import task from "tasuku";
import { PrismaClient } from "@prisma/client";
// Seeds

process.env.NODE_ENV = "development";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function PruneDatabaseSeed(db: PrismaClient) {
  const args = process.argv.slice(2);
  // Exclude some seeds from the list
  const excluded: Array<string> = [];
  const isExcluded = (seed: string) => excluded.includes(seed);
  // Example: npm run db:seed:prune -- --exclude=users
  if (args.includes("--exclude=users")) {
    excluded.push("users");
  }

  let shouldPruneAll: boolean = args.includes("--all") || true;
  // Example: npm run db:seed:prune -- --users
  if (args.includes("--users")) {
    // await PruneUsersData(db);
    shouldPruneAll = false;
  }

  // Example: npm run db:seed:prune -- --all
  // Example: npm run db:seed:prune
  if (shouldPruneAll) {
    await task("Pruning all data", async ({ setTitle }) => {
      if (!isExcluded("users")) {
        setTitle("Pruning users...");
        // await PruneUsersData(db);
        setTitle("Pruned users 🎉");
      }

      setTitle("Pruned all data successfully 🎉");
    });
  }
}

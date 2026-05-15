import { PrismaClient } from "@prisma/client";
// Seeds
import { PrepareMain } from "./main";

/**
 * Top-level "prepare" entry. Owns CLI flag parsing for the prepared side:
 *
 *   bun run db:seed                            # prepare everything
 *   bun run db:seed -- --prepare               # explicit
 *   bun run db:seed -- --prepare --main        # only the "main" pack
 *   bun run db:seed -- --prepare --exclude=main
 */
export async function PrepareDatabase(db: PrismaClient) {
  const args = process.argv.slice(2);

  // Exclude some seeds from the list
  const excluded: Array<string> = [];
  const isExcluded = (seed: string) => excluded.includes(seed);
  if (args.includes("--exclude=main")) {
    excluded.push("main");
  }

  // When the user asks for a specific pack (e.g. `--main`), only run that.
  // Otherwise, run every pack that hasn't been excluded.
  const onlyMain = args.includes("--main");
  if (onlyMain) {
    await PrepareMain(db);
    return;
  }

  console.log("Preparing all data…");
  if (!isExcluded("main")) {
    await PrepareMain(db);
  }
  console.log("Prepared all data 🎉");
}

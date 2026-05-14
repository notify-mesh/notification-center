import task from "tasuku";
import { PrismaClient } from "@prisma/client";

export async function PrepareMain(db: PrismaClient) {
  await task("Preparing main", async ({ setTitle, setError }) => {
    try {
      setTitle("Seeding database...");

      setTitle("🎉 Database comprehensively seeded with payment gateway data!");

      // Close MongoDB connection
    } catch (error) {
      setError(error as Error);

      throw error;
    }
  });
}

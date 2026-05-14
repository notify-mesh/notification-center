import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

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
  compress: true,
  trace: true,
  debug: false,
  bigIntAsNumber: false,
});
export const prismaDbClient = new PrismaClient({
  adapter,
  transactionOptions: {
    maxWait: 60_000,
    timeout: 60_000,
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  },
  errorFormat: "pretty",
});

export const DbClient = prismaDbClient;

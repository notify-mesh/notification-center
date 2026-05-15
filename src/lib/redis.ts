import { Redis } from "ioredis";
// Creating a custom client
export const redisClient = new Redis({
  connectionName: "Notification Center",
  name: "Notification Center",
  commandQueue: false,
  keyPrefix: `nc/`,
  enableAutoPipelining: true,
  enableReadyCheck: true,
  lazyConnect: true,
  noDelay: true,
  showFriendlyErrorStack: true,
  stringNumbers: false,
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT!),
  db: process.env.REDIS_DB ? Number(process.env.REDIS_DB) : 0,
  ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
});

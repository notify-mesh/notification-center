import { RedisClient } from "bun";

// Creating a custom client
export const redisClient = new RedisClient(process.env.REDIS_URL);

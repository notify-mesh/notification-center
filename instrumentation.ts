export async function register() {
  // The oRPC server-side client touches Node-only modules (Prisma adapter,
  // Bun's RedisClient, the SMS providers' `https` import) so it must NOT
  // load in the Edge runtime that the proxy/middleware compiles into.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@root/lib/orpc/server-client");
  }
}

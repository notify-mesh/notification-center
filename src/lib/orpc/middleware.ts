import "server-only";

import { os, type Middleware, type ORPCErrorConstructorMap, type Meta } from "@orpc/server";
import { auth } from "@root/lib/auth";
import { redisClient } from "@root/lib/redis";
import type { ORPCContext } from "./context";
import { baseErrors } from "./errors";

/**
 * The "base" procedure that every router member inherits from. Declares the
 * request-scoped context shape, the typed error map, and a session-loader
 * middleware that runs at most once per request.
 */
export const base = os
  .$context<ORPCContext>()
  .errors(baseErrors)
  .use(async ({ context, next }) => {
    if (context.session !== null) return next();

    const session = await auth.api.getSession({ headers: context.headers });
    return next({ context: { session } });
  });

/** Public procedures — anyone may call. */
export const publicProcedure = base;

/** Authenticated procedures — throws `UNAUTHORIZED` if no session. */
export const authedProcedure = base.use(async ({ context, next, errors }) => {
  if (!context.session?.user) {
    throw errors.UNAUTHORIZED();
  }
  return next({
    context: {
      session: context.session,
      user: context.session.user,
    },
  });
});

/** Admin procedures — requires the `admin` role on the user record. */
export const adminProcedure = authedProcedure.use(async ({ context, next, errors }) => {
  if ((context.user as { role?: string | null }).role !== "admin") {
    throw errors.FORBIDDEN();
  }
  return next({ context });
});

type BaseErrors = typeof baseErrors;
type RateLimitErrorMap = ORPCErrorConstructorMap<BaseErrors>;

/**
 * Fixed-window rate-limit middleware factory. Returns a plain oRPC
 * middleware so callers do `someProcedure.use(rateLimit({...}))`.
 *
 * Counter strategy: `INCR rl:<scope>:<id>:<windowEpoch>` with `EXPIRE` on
 * first increment. Cheap, atomic in Redis, slight inaccuracy at window
 * boundaries (acceptable for the auth flows that use it).
 */
export function rateLimit(options: {
  scope: string;
  max: number;
  windowSeconds: number;
}): Middleware<ORPCContext, Record<never, never>, unknown, unknown, RateLimitErrorMap, Meta> {
  const { scope, max, windowSeconds } = options;

  return async ({ context, next, errors }) => {
    const identifier =
      context.session?.user.id ?? context.ip ?? context.headers.get("user-agent") ?? "anon";
    const windowEpoch = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `rl:${scope}:${identifier}:${windowEpoch}`;

    const count = Number(await redisClient.incr(key));
    if (count === 1) {
      await redisClient.expire(key, windowSeconds);
    }

    if (count > max) {
      const ttl = Number(await redisClient.ttl(key));
      throw errors.RATE_LIMITED({
        data: { retryAfterSeconds: Math.max(1, ttl) },
      });
    }

    return next();
  };
}

import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
// `@orpc/zod/zod4` is the Zod v4-compatible converter; the default
// `@orpc/zod` entry only understands Zod v3 internals and silently no-ops
// on v4 schemas, which would collapse every input to `any` and break
// dynamic-path-param validation in the OpenAPI generator.
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { onError, ORPCError } from "@orpc/server";
import {
  CORSPlugin,
  ResponseHeadersPlugin,
  experimental_RethrowHandlerPlugin as RethrowHandlerPlugin,
} from "@orpc/server/plugins";
import { router } from "@root/router";
import { createORPCContext, type ORPCContext } from "@root/lib/orpc";

/**
 * The OpenAPI handler exposes the same router as a REST/JSON API and serves
 * an interactive Scalar reference UI alongside the spec.
 *
 * URL map under `/api`:
 *  - `/api`            → Scalar reference UI (HTML)
 *  - `/api/spec.json`  → OpenAPI JSON document
 *  - `/api/<route>`    → actual REST endpoints (e.g. `GET /api/health`)
 */
const handler = new OpenAPIHandler<ORPCContext>(router, {
  plugins: [
    new CORSPlugin({
      origin: (origin) => origin,
      credentials: true,
    }),
    new ResponseHeadersPlugin(),
    new RethrowHandlerPlugin({
      filter: (error) => !(error instanceof ORPCError),
    }),
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specPath: "/spec.json",
      docsPath: "/",
      docsTitle: "Notification Center API",
      docsProvider: "scalar",
      specGenerateOptions: {
        info: {
          title: "Notification Center API",
          version: "1.0.0",
          description: "Admin and integration API for the Notification Center.",
        },
        servers: [{ url: "/api" }],
        security: [{ bearerAuth: [] }],
        components: {
          securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer" },
          },
        },
      },
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error("[api]", error);
    }),
  ],
});

async function handleRequest(request: Request) {
  const ctx = await createORPCContext(request);

  const { response } = await handler.handle(request, {
    prefix: "/api",
    context: ctx,
  });

  return response ?? new Response("Not found", { status: 404 });
}

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;

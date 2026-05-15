import "server-only";

import { z } from "zod";
import { publicProcedure } from "@root/lib/orpc";

export const health = publicProcedure
  .route({
    method: "GET",
    path: "/health",
    summary: "Health probe",
    tags: ["system"],
  })
  .output(
    z.object({
      status: z.literal("ok"),
      uptime: z.number(),
      timestamp: z.string(),
    }),
  )
  .handler(() => ({
    status: "ok" as const,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

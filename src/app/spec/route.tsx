import { router } from "@/router";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";

const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

export async function GET(request: Request) {
  const spec = await openAPIGenerator.generate(router, {
    info: {
      title: "Notification Center Playground",
      version: "1.0.0",
      description: `
Notification Center API

## Resources

* [Github](https://github.com/ali-master/notification-center)
* [Documentation](https://notification-center.usestrict.dev)
          `,
    },
    servers: [{ url: "/api" /** Should use absolute URLs in production */ }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
  });

  return new Response(JSON.stringify(spec), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}

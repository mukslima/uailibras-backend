import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../plugins/auth";
import { createTagSchema } from "../schemas/tags";
import { createTag, listTags } from "../services/tags";
import { parseBody } from "../utils/validation";

export async function tagRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: requireAuth }, async () => {
    return listTags();
  });

  app.post("/", { preHandler: requireRole(["ADMIN", "AUTHOR"]) }, async (request, reply) => {
    const body = parseBody(createTagSchema, request.body);
    const tag = await createTag(body);

    reply.code(201);
    return tag;
  });
}

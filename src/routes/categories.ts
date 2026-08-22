import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../plugins/auth";
import { createCategorySchema, updateCategorySchema } from "../schemas/categories";
import { uuidParamSchema } from "../schemas/common";
import { createCategory, listCategories, updateCategory } from "../services/categories";
import { parseBody } from "../utils/validation";

export async function categoryRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return listCategories();
  });

  app.post("/", { preHandler: requireRole(["ADMIN"]) }, async (request, reply) => {
    const body = parseBody(createCategorySchema, request.body);
    const category = await createCategory(body);

    reply.code(201);
    return category;
  });

  app.get("/internal/all", { preHandler: requireAuth }, async () => {
    return listCategories(true);
  });

  app.patch("/:id", { preHandler: requireRole(["ADMIN"]) }, async (request) => {
    const params = parseBody(uuidParamSchema, request.params);
    const body = parseBody(updateCategorySchema, request.body);

    return updateCategory(params.id, body);
  });
}

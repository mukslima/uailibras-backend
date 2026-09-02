import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../plugins/auth";
import { uuidParamSchema } from "../schemas/common";
import {
  adminNewsQuerySchema,
  createNewsSchema,
  featureNewsSchema,
  publicNewsQuerySchema,
  rejectNewsSchema,
  reviewCommentSchema,
  updateNewsSchema,
} from "../schemas/news";
import {
  approveNews,
  archiveNews,
  createPublishedNewsRevision,
  createNews,
  featureNews,
  getAdminNewsById,
  getPublicNewsBySlug,
  listAdminNews,
  listPublicNews,
  publishNews,
  rejectNews,
  submitNews,
  updateNews,
} from "../services/news";
import { parseBody } from "../utils/validation";

const slugParamSchema = z.object({
  slug: z.string().trim().min(1).max(220),
});

export async function newsRoutes(app: FastifyInstance) {
  app.get("/news", async (request) => {
    const query = parseBody(publicNewsQuerySchema, request.query);

    return listPublicNews(query);
  });

  app.get("/news/:slug", async (request) => {
    const params = parseBody(slugParamSchema, request.params);

    return getPublicNewsBySlug(params.slug);
  });

  app.post("/news", { preHandler: requireRole(["ADMIN", "AUTHOR"]) }, async (request, reply) => {
    const body = parseBody(createNewsSchema, request.body);
    const news = await createNews(body, request.currentUser!);

    reply.code(201);
    return news;
  });

  app.get("/admin/news", { preHandler: requireAuth }, async (request) => {
    const query = parseBody(adminNewsQuerySchema, request.query);

    return listAdminNews(query, request.currentUser!);
  });

  app.get("/admin/news/:id", { preHandler: requireAuth }, async (request) => {
    const params = parseBody(uuidParamSchema, request.params);

    return getAdminNewsById(params.id, request.currentUser!);
  });

  app.patch("/news/:id", { preHandler: requireAuth }, async (request) => {
    const params = parseBody(uuidParamSchema, request.params);
    const body = parseBody(updateNewsSchema, request.body);

    return updateNews(params.id, body, request.currentUser!);
  });

  app.post("/news/:id/revision", { preHandler: requireRole(["ADMIN", "AUTHOR"]) }, async (request) => {
    const params = parseBody(uuidParamSchema, request.params);

    return createPublishedNewsRevision(params.id, request.currentUser!);
  });

  app.post("/news/:id/submit", { preHandler: requireAuth }, async (request) => {
    const params = parseBody(uuidParamSchema, request.params);

    return submitNews(params.id, request.currentUser!);
  });

  app.post("/news/:id/reject", { preHandler: requireRole(["ADMIN", "REVIEWER"]) }, async (request) => {
    const params = parseBody(uuidParamSchema, request.params);
    const body = parseBody(rejectNewsSchema, request.body);

    return rejectNews(params.id, body.comment, request.currentUser!);
  });

  app.post("/news/:id/approve", { preHandler: requireRole(["ADMIN", "REVIEWER"]) }, async (request) => {
    const params = parseBody(uuidParamSchema, request.params);
    const body = parseBody(reviewCommentSchema, request.body ?? {});

    return approveNews(params.id, body.comment, request.currentUser!);
  });

  app.post("/news/:id/publish", { preHandler: requireRole(["ADMIN", "REVIEWER"]) }, async (request) => {
    const params = parseBody(uuidParamSchema, request.params);
    const body = parseBody(featureNewsSchema.partial(), request.body ?? {});

    return publishNews(params.id, request.currentUser!, body.featuredPosition ?? null);
  });

  app.post("/news/:id/archive", { preHandler: requireRole(["ADMIN", "REVIEWER"]) }, async (request) => {
    const params = parseBody(uuidParamSchema, request.params);

    return archiveNews(params.id, request.currentUser!);
  });

  app.post("/news/:id/feature", { preHandler: requireRole(["ADMIN", "REVIEWER"]) }, async (request) => {
    const params = parseBody(uuidParamSchema, request.params);
    const body = parseBody(featureNewsSchema, request.body);

    return featureNews(params.id, body.featuredPosition, request.currentUser!);
  });
}

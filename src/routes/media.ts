import type { FastifyInstance } from "fastify";
import { requireRole } from "../plugins/auth";
import { uuidParamSchema } from "../schemas/common";
import { deleteMedia, uploadMedia } from "../services/media";
import { parseBody } from "../utils/validation";

export async function mediaRoutes(app: FastifyInstance) {
  app.post("/", { preHandler: requireRole(["ADMIN", "AUTHOR"]) }, async (request, reply) => {
    const file = await request.file();

    if (!file) {
      throw Object.assign(new Error("File is required"), { statusCode: 400 });
    }

    const buffer = await file.toBuffer();
    const media = await uploadMedia({
      buffer,
      originalName: file.filename,
      uploadedById: request.currentUser!.id,
    });

    reply.code(201);
    return media;
  });

  app.delete("/:id", { preHandler: requireRole(["ADMIN", "AUTHOR"]) }, async (request) => {
    const params = parseBody(uuidParamSchema, request.params);

    return deleteMedia(params.id, request.currentUser!);
  });
}

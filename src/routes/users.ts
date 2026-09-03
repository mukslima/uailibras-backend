import type { FastifyInstance } from "fastify";
import { requireRole } from "../plugins/auth";
import { createUserSchema, updateUserSchema, uuidParamSchema } from "../schemas/users";
import { createUser, getUserById, listUsers, updateUser } from "../services/users";
import { parseBody } from "../utils/validation";

export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireRole(["ADMIN"]));

  app.post("/", async (request, reply) => {
    const body = parseBody(createUserSchema, request.body);
    const user = await createUser(body);

    reply.code(201);
    return user;
  });

  app.get("/", async () => {
    return listUsers();
  });

  app.get("/:id", async (request) => {
    const params = parseBody(uuidParamSchema, request.params);

    return getUserById(params.id);
  });

  app.patch("/:id", async (request) => {
    const params = parseBody(uuidParamSchema, request.params);
    const body = parseBody(updateUserSchema, request.body);

    return updateUser(params.id, body, request.currentUser!);
  });
}

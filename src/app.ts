import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { getJwtAccessSecret } from "./config/auth";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.register(cookie);
  app.register(jwt, {
    secret: getJwtAccessSecret(),
  });

  app.get("/health", async () => {
    return {
      status: "ok",
    };
  });

  app.register(authRoutes, {
    prefix: "/api/v1/auth",
  });
  app.register(userRoutes, {
    prefix: "/api/v1/users",
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

    reply.code(statusCode).send({
      message: statusCode === 500 ? "Internal server error" : error.message,
    });
  });

  return app;
}

import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { getJwtAccessSecret } from "./config/auth";
import { getCorsOptions } from "./config/cors";
import { authRoutes } from "./routes/auth";
import { categoryRoutes } from "./routes/categories";
import { mediaRoutes } from "./routes/media";
import { newsRoutes } from "./routes/news";
import { tagRoutes } from "./routes/tags";
import { userRoutes } from "./routes/users";
import { maxUploadSize } from "./services/media";

export function buildApp() {
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers.set-cookie",
        "*.password",
        "*.passwordHash",
        "*.token",
        "*.accessToken",
        "*.refreshToken",
      ],
    },
  });

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header("X-Frame-Options", "DENY");
  });

  app.register(cors, getCorsOptions());
  app.register(cookie);
  app.register(jwt, {
    secret: getJwtAccessSecret(),
  });
  app.register(multipart, {
    limits: {
      fileSize: maxUploadSize,
      files: 1,
    },
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
  app.register(categoryRoutes, {
    prefix: "/api/v1/categories",
  });
  app.register(tagRoutes, {
    prefix: "/api/v1/tags",
  });
  app.register(mediaRoutes, {
    prefix: "/api/v1/media",
  });
  app.register(newsRoutes, {
    prefix: "/api/v1",
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, "Unhandled request error");
    }

    reply.code(statusCode).send({
      message: statusCode === 500 ? "Internal server error" : error.message,
    });
  });

  return app;
}

import type { FastifyInstance, FastifyReply } from "fastify";
import { REFRESH_TOKEN_COOKIE_NAME, getRefreshTokenExpiresIn, isProduction } from "../config/auth";
import { requireAuth } from "../plugins/auth";
import { loginSchema } from "../schemas/auth";
import { login, logout, refresh } from "../services/auth";
import { parseDurationToMs } from "../utils/duration";
import { parseBody } from "../utils/validation";

function setRefreshCookie(reply: FastifyReply, refreshToken: string) {
  reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/api/v1/auth",
    expires: new Date(Date.now() + parseDurationToMs(getRefreshTokenExpiresIn())),
  });
}

function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    path: "/api/v1/auth",
    sameSite: "lax",
    secure: isProduction(),
  });
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/login", async (request, reply) => {
    const body = parseBody(loginSchema, request.body);
    const result = await login(app, body.identifier, body.password);

    setRefreshCookie(reply, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  });

  app.post("/refresh", async (request, reply) => {
    const result = await refresh(app, request.cookies[REFRESH_TOKEN_COOKIE_NAME]);

    setRefreshCookie(reply, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  });

  app.post("/logout", async (request, reply) => {
    await logout(request.cookies[REFRESH_TOKEN_COOKIE_NAME]);
    clearRefreshCookie(reply);

    return {
      success: true,
    };
  });

  app.get("/me", { preHandler: requireAuth }, async (request) => {
    return request.currentUser;
  });
}

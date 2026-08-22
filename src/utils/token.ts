import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getAccessTokenExpiresIn, getRefreshTokenExpiresIn } from "../config/auth";
import { parseDurationToMs } from "./duration";

export type AccessTokenPayload = {
  sub: string;
  role: "ADMIN" | "AUTHOR" | "REVIEWER";
};

export function signAccessToken(app: FastifyInstance, payload: AccessTokenPayload) {
  return app.jwt.sign(payload, {
    expiresIn: getAccessTokenExpiresIn(),
  });
}

export function createRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getRefreshTokenExpiresAt() {
  return new Date(Date.now() + parseDurationToMs(getRefreshTokenExpiresIn()));
}

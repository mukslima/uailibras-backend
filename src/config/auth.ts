import "dotenv/config";

export const REFRESH_TOKEN_COOKIE_NAME = "uailibras_refresh_token";

export function getAccessTokenExpiresIn() {
  return process.env.JWT_ACCESS_EXPIRES_IN || "15m";
}

export function getRefreshTokenExpiresIn() {
  return process.env.JWT_REFRESH_EXPIRES_IN || "7d";
}

export function getJwtAccessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is required");
  }

  return secret;
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

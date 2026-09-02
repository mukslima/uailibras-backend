import "dotenv/config";

export const REFRESH_TOKEN_COOKIE_NAME = "uailibras_refresh_token";

const sameSiteValues = ["lax", "strict", "none"] as const;
type RefreshCookieSameSite = (typeof sameSiteValues)[number];

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

export function getRefreshTokenCookieDomain() {
  return process.env.REFRESH_TOKEN_COOKIE_DOMAIN || undefined;
}

export function getRefreshTokenCookieSameSite(): RefreshCookieSameSite {
  const value = process.env.REFRESH_TOKEN_COOKIE_SAMESITE?.toLowerCase();

  if (sameSiteValues.includes(value as RefreshCookieSameSite)) {
    return value as RefreshCookieSameSite;
  }

  return "lax";
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

import type { FastifyCorsOptions } from "@fastify/cors";
import { isProduction } from "./auth";

const defaultDevelopmentOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

function parseOrigins(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getAllowedAdminOrigins() {
  const configuredOrigins = parseOrigins(process.env.ADMIN_CORS_ORIGINS);

  if (configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  return isProduction() ? [] : defaultDevelopmentOrigins;
}

export function getCorsOptions(): FastifyCorsOptions {
  const allowedOrigins = new Set(getAllowedAdminOrigins());

  return {
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"), false);
    },
  };
}

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";

process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-characters";
process.env.JWT_ACCESS_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";
process.env.ADMIN_CORS_ORIGINS = "http://localhost:3000,https://painel.uailibras.com.br";

let app: FastifyInstance;

before(async () => {
  const appModule = await import("./app.js");

  app = appModule.buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
});

test("CORS preflight allows local admin origin with credentials", async () => {
  const response = await app.inject({
    method: "OPTIONS",
    url: "/api/v1/auth/login",
    headers: {
      origin: "http://localhost:3000",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:3000");
  assert.equal(response.headers["access-control-allow-credentials"], "true");
  assert.match(String(response.headers["access-control-allow-methods"]), /POST/);
  assert.match(String(response.headers["access-control-allow-headers"]), /Content-Type/i);
});

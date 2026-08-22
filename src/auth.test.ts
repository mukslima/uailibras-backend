import assert from "node:assert/strict";
import type { OutgoingHttpHeaders } from "node:http";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-characters";
process.env.JWT_ACCESS_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";

let app: FastifyInstance;
let prisma: PrismaClient;
let hashPassword: (password: string) => Promise<string>;

const password = "password1234";
const testEmailDomain = "@auth.test";

function authHeader(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
  };
}

function extractCookie(response: { headers: OutgoingHttpHeaders }) {
  const setCookie = response.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  if (typeof cookie !== "string") {
    assert.fail("Expected set-cookie header");
  }

  return cookie.split(";")[0];
}

async function createTestUser(role: "ADMIN" | "AUTHOR" | "REVIEWER", suffix: string, active = true) {
  return prisma.user.create({
    data: {
      username: `test.${suffix}`,
      name: `Test ${suffix}`,
      email: `${suffix}${testEmailDomain}`,
      passwordHash: await hashPassword(password),
      role,
      active,
    },
  });
}

async function loginAs(identifier: string, passwordValue = password) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      identifier,
      password: passwordValue,
    },
  });
}

before(async () => {
  const appModule = await import("./app.js");
  const prismaModule = await import("./lib/prisma.js");
  const passwordModule = await import("./utils/password.js");

  app = appModule.buildApp();
  prisma = prismaModule.prisma;
  hashPassword = passwordModule.hashPassword;

  await app.ready();
  await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: testEmailDomain,
      },
    },
  });
});

after(async () => {
  await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: testEmailDomain,
      },
    },
  });
  await app.close();
  await prisma.$disconnect();
});

test("auth and user administration", async (t) => {
  const admin = await createTestUser("ADMIN", "admin");
  const author = await createTestUser("AUTHOR", "author");
  const reviewer = await createTestUser("REVIEWER", "reviewer");
  const inactive = await createTestUser("AUTHOR", "inactive", false);

  let adminAccessToken = "";

  await t.test("valid login returns 200 and refresh cookie", async () => {
    const response = await loginAs("TEST.ADMIN");

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.ok(body.accessToken);
    assert.equal(body.user.id, admin.id);
    assert.equal(body.user.passwordHash, undefined);
    assert.match(extractCookie(response), /^uailibras_refresh_token=/);

    adminAccessToken = body.accessToken;
  });

  await t.test("incorrect password returns 401", async () => {
    const response = await loginAs(admin.email, "wrong-password");

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().message, "Invalid credentials");
  });

  await t.test("missing user returns 401", async () => {
    const response = await loginAs(`missing${testEmailDomain}`);

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().message, "Invalid credentials");
  });

  await t.test("inactive user cannot authenticate", async () => {
    const response = await loginAs(inactive.email);

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().message, "Invalid credentials");
  });

  await t.test("me requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });

    assert.equal(response.statusCode, 401);
  });

  await t.test("me returns the authenticated user", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: authHeader(adminAccessToken),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().id, admin.id);
    assert.equal(response.json().passwordHash, undefined);
  });

  await t.test("AUTHOR cannot access admin routes", async () => {
    const loginResponse = await loginAs(author.email);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: authHeader(loginResponse.json().accessToken),
    });

    assert.equal(response.statusCode, 403);
  });

  await t.test("REVIEWER cannot access admin routes", async () => {
    const loginResponse = await loginAs(reviewer.email);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: authHeader(loginResponse.json().accessToken),
    });

    assert.equal(response.statusCode, 403);
  });

  await t.test("ADMIN can access admin routes", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: authHeader(adminAccessToken),
    });

    assert.equal(response.statusCode, 200);
    assert.ok(Array.isArray(response.json()));
  });

  await t.test("valid refresh rotates token and returns a new access token", async () => {
    const loginResponse = await loginAs(admin.email);
    const cookie = extractCookie(loginResponse);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: {
        cookie,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.ok(response.json().accessToken);
    assert.match(extractCookie(response), /^uailibras_refresh_token=/);

    const reusedResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: {
        cookie,
      },
    });

    assert.equal(reusedResponse.statusCode, 401);
  });

  await t.test("invalid refresh is rejected", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: {
        cookie: "uailibras_refresh_token=invalid",
      },
    });

    assert.equal(response.statusCode, 401);
  });

  await t.test("logout revokes the current refresh token", async () => {
    const loginResponse = await loginAs(admin.email);
    const cookie = extractCookie(loginResponse);
    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: {
        cookie,
      },
    });

    assert.equal(logoutResponse.statusCode, 200);

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: {
        cookie,
      },
    });

    assert.equal(refreshResponse.statusCode, 401);
  });

  await t.test("ADMIN can create users", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: authHeader(adminAccessToken),
      payload: {
        username: "test.created",
        name: "Test Created",
        email: `created${testEmailDomain}`,
        password,
        role: "AUTHOR",
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().username, "test.created");
    assert.equal(response.json().passwordHash, undefined);
  });

  await t.test("duplicate username is rejected", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: authHeader(adminAccessToken),
      payload: {
        username: "TEST.CREATED",
        name: "Duplicate Username",
        email: `duplicate-username${testEmailDomain}`,
        password,
        role: "AUTHOR",
      },
    });

    assert.equal(response.statusCode, 409);
  });

  await t.test("duplicate email is rejected", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: authHeader(adminAccessToken),
      payload: {
        username: "test.duplicate.email",
        name: "Duplicate Email",
        email: `CREATED${testEmailDomain}`,
        password,
        role: "AUTHOR",
      },
    });

    assert.equal(response.statusCode, 409);
  });
});

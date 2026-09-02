import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import type { PrismaClient, User } from "@prisma/client";
import { normalizeSlug } from "./utils/normalize";

process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-characters";
process.env.JWT_ACCESS_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";

let app: FastifyInstance;
let prisma: PrismaClient;
let hashPassword: (password: string) => Promise<string>;
let categoryId = "";
let author: User;
let reviewer: User;
let adminAuthor: User;
let adminPublisher: User;
let authorToken = "";
let reviewerToken = "";
let adminAuthorToken = "";
let adminPublisherToken = "";

const password = "password1234";
const testEmailDomain = "@featured.test";
const testSlugPrefix = "featured-test";

function authHeader(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
  };
}

async function createTestUser(role: "ADMIN" | "AUTHOR" | "REVIEWER", suffix: string) {
  return prisma.user.create({
    data: {
      username: `featured.${suffix}`,
      name: `Featured ${suffix}`,
      email: `${suffix}${testEmailDomain}`,
      passwordHash: await hashPassword(password),
      role,
      active: true,
    },
  });
}

async function loginAs(email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      identifier: email,
      password,
    },
  });

  assert.equal(response.statusCode, 200);
  return response.json().accessToken as string;
}

async function cleanup() {
  await prisma.news.deleteMany({
    where: {
      slug: {
        startsWith: testSlugPrefix,
      },
    },
  });
}

async function cleanupAll() {
  await cleanup();
  await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: testEmailDomain,
      },
    },
  });
}

async function createPublishedNews(suffix: string, featuredPosition: 1 | 2 | 3 | null) {
  return prisma.news.create({
    data: {
      title: `Featured Test ${suffix}`,
      slug: `${testSlugPrefix}-${normalizeSlug(suffix)}`,
      summary: `Resumo completo da noticia ${suffix}.`,
      content: `<p>Conteudo completo da noticia ${suffix}.</p>`,
      status: "PUBLISHED",
      authorId: author.id,
      primaryCategoryId: categoryId,
      featuredPosition,
      publishedById: reviewer.id,
      publishedAt: new Date(),
      categories: {
        create: {
          categoryId,
        },
      },
    },
  });
}

async function createApprovedNews(suffix: string, newsAuthor = author) {
  return prisma.news.create({
    data: {
      title: `Featured Test ${suffix}`,
      slug: `${testSlugPrefix}-${normalizeSlug(suffix)}`,
      summary: `Resumo completo da noticia ${suffix}.`,
      content: `<p>Conteudo completo da noticia ${suffix}.</p>`,
      status: "APPROVED",
      authorId: newsAuthor.id,
      approvedById: reviewer.id,
      primaryCategoryId: categoryId,
      requestedFeaturedPosition: 1,
      categories: {
        create: {
          categoryId,
        },
      },
    },
  });
}

async function getPositions(ids: string[]) {
  const news = await prisma.news.findMany({
    where: {
      id: {
        in: ids,
      },
    },
    select: {
      id: true,
      featuredPosition: true,
    },
  });

  return new Map(news.map((item) => [item.id, item.featuredPosition]));
}

async function assertUniqueFeaturedPositions() {
  const featured = await prisma.news.findMany({
    where: {
      slug: {
        startsWith: testSlugPrefix,
      },
      featuredPosition: {
        not: null,
      },
    },
    select: {
      featuredPosition: true,
    },
  });
  const positions = featured.map((item) => item.featuredPosition);

  assert.equal(new Set(positions).size, positions.length);
}

before(async () => {
  const appModule = await import("./app.js");
  const prismaModule = await import("./lib/prisma.js");
  const passwordModule = await import("./utils/password.js");

  app = appModule.buildApp();
  prisma = prismaModule.prisma;
  hashPassword = passwordModule.hashPassword;

  await app.ready();
  await cleanupAll();

  const category = await prisma.category.upsert({
    where: {
      slug: "featured-test-category",
    },
    update: {
      active: true,
    },
    create: {
      name: "Featured Test Category",
      slug: "featured-test-category",
      active: true,
    },
  });
  categoryId = category.id;
  author = await createTestUser("AUTHOR", "author");
  reviewer = await createTestUser("REVIEWER", "reviewer");
  adminAuthor = await createTestUser("ADMIN", "admin-author");
  adminPublisher = await createTestUser("ADMIN", "admin-publisher");
  authorToken = await loginAs(author.email);
  reviewerToken = await loginAs(reviewer.email);
  adminAuthorToken = await loginAs(adminAuthor.email);
  adminPublisherToken = await loginAs(adminPublisher.email);
});

after(async () => {
  await cleanupAll();
  await app.close();
  await prisma.$disconnect();
});

test("featured news rotation and permissions", async (t) => {
  await t.test("publishing as main rotates 1 to 2, 2 to 3, and 3 to normal", async () => {
    await cleanup();
    const a = await createPublishedNews("main-a", 1);
    const b = await createPublishedNews("main-b", 2);
    const c = await createPublishedNews("main-c", 3);
    const d = await createApprovedNews("main-d");

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/news/${d.id}/publish`,
      headers: authHeader(reviewerToken),
      payload: {
        featuredPosition: 1,
      },
    });

    assert.equal(response.statusCode, 200);
    const positions = await getPositions([a.id, b.id, c.id, d.id]);
    assert.equal(positions.get(d.id), 1);
    assert.equal(positions.get(a.id), 2);
    assert.equal(positions.get(b.id), 3);
    assert.equal(positions.get(c.id), null);
    await assertUniqueFeaturedPositions();
  });

  await t.test("publishing as secondary keeps 1, rotates 2 to 3, and 3 to normal", async () => {
    await cleanup();
    const a = await createPublishedNews("secondary-a", 1);
    const b = await createPublishedNews("secondary-b", 2);
    const c = await createPublishedNews("secondary-c", 3);
    const d = await createApprovedNews("secondary-d");

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/news/${d.id}/publish`,
      headers: authHeader(reviewerToken),
      payload: {
        featuredPosition: 2,
      },
    });

    assert.equal(response.statusCode, 200);
    const positions = await getPositions([a.id, b.id, c.id, d.id]);
    assert.equal(positions.get(a.id), 1);
    assert.equal(positions.get(d.id), 2);
    assert.equal(positions.get(b.id), 3);
    assert.equal(positions.get(c.id), null);
    await assertUniqueFeaturedPositions();
  });

  await t.test("publishing as normal does not move existing featured news", async () => {
    await cleanup();
    const a = await createPublishedNews("normal-a", 1);
    const b = await createPublishedNews("normal-b", 2);
    const c = await createPublishedNews("normal-c", 3);
    const d = await createApprovedNews("normal-d");

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/news/${d.id}/publish`,
      headers: authHeader(reviewerToken),
      payload: {
        featuredPosition: null,
      },
    });

    assert.equal(response.statusCode, 200);
    const positions = await getPositions([a.id, b.id, c.id, d.id]);
    assert.equal(positions.get(a.id), 1);
    assert.equal(positions.get(b.id), 2);
    assert.equal(positions.get(c.id), 3);
    assert.equal(positions.get(d.id), null);
    await assertUniqueFeaturedPositions();
  });

  await t.test("archiving featured news clears its featured position", async () => {
    await cleanup();
    const news = await createPublishedNews("archive-a", 1);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/news/${news.id}/archive`,
      headers: authHeader(reviewerToken),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "ARCHIVED");
    assert.equal(response.json().featuredPosition, null);
  });

  await t.test("unpublishing removes news from public API and republication as normal restores it without featured position", async () => {
    await cleanup();
    const news = await createPublishedNews("unpublish-normal", 1);

    const visibleBefore = await app.inject({
      method: "GET",
      url: `/api/v1/news/${news.slug}`,
    });
    assert.equal(visibleBefore.statusCode, 200);

    const unpublished = await app.inject({
      method: "POST",
      url: `/api/v1/news/${news.id}/archive`,
      headers: authHeader(reviewerToken),
    });

    assert.equal(unpublished.statusCode, 200);
    assert.equal(unpublished.json().status, "ARCHIVED");
    assert.equal(unpublished.json().featuredPosition, null);

    const hiddenDetail = await app.inject({
      method: "GET",
      url: `/api/v1/news/${news.slug}`,
    });
    assert.equal(hiddenDetail.statusCode, 404);

    const hiddenList = await app.inject({
      method: "GET",
      url: "/api/v1/news",
    });
    assert.equal(hiddenList.statusCode, 200);
    assert.equal(hiddenList.json().items.some((item: { id: string }) => item.id === news.id), false);

    const republished = await app.inject({
      method: "POST",
      url: `/api/v1/news/${news.id}/publish`,
      headers: authHeader(reviewerToken),
      payload: {
        featuredPosition: null,
      },
    });

    assert.equal(republished.statusCode, 200);
    assert.equal(republished.json().status, "PUBLISHED");
    assert.equal(republished.json().featuredPosition, null);
    assert.equal(republished.json().publishedById, reviewer.id);
    assert.ok(republished.json().publishedAt);

    const visibleAgain = await app.inject({
      method: "GET",
      url: `/api/v1/news/${news.slug}`,
    });
    assert.equal(visibleAgain.statusCode, 200);
    assert.equal(visibleAgain.json().id, news.id);
    assert.equal(visibleAgain.json().featuredPosition, null);
  });

  await t.test("republication as main and secondary uses the existing featured rotation", async () => {
    await cleanup();
    const mainA = await createPublishedNews("repub-main-a", 1);
    const mainB = await createPublishedNews("repub-main-b", 2);
    const mainC = await createPublishedNews("repub-main-c", 3);
    const mainArchived = await createPublishedNews("repub-main-target", null);

    await app.inject({
      method: "POST",
      url: `/api/v1/news/${mainArchived.id}/archive`,
      headers: authHeader(reviewerToken),
    });

    const mainResponse = await app.inject({
      method: "POST",
      url: `/api/v1/news/${mainArchived.id}/publish`,
      headers: authHeader(reviewerToken),
      payload: {
        featuredPosition: 1,
      },
    });

    assert.equal(mainResponse.statusCode, 200);
    let positions = await getPositions([mainA.id, mainB.id, mainC.id, mainArchived.id]);
    assert.equal(positions.get(mainArchived.id), 1);
    assert.equal(positions.get(mainA.id), 2);
    assert.equal(positions.get(mainB.id), 3);
    assert.equal(positions.get(mainC.id), null);
    await assertUniqueFeaturedPositions();

    await cleanup();
    const secondaryA = await createPublishedNews("repub-secondary-a", 1);
    const secondaryB = await createPublishedNews("repub-secondary-b", 2);
    const secondaryC = await createPublishedNews("repub-secondary-c", 3);
    const secondaryArchived = await createPublishedNews("repub-secondary-target", null);

    await app.inject({
      method: "POST",
      url: `/api/v1/news/${secondaryArchived.id}/archive`,
      headers: authHeader(reviewerToken),
    });

    const secondaryResponse = await app.inject({
      method: "POST",
      url: `/api/v1/news/${secondaryArchived.id}/publish`,
      headers: authHeader(reviewerToken),
      payload: {
        featuredPosition: 2,
      },
    });

    assert.equal(secondaryResponse.statusCode, 200);
    positions = await getPositions([secondaryA.id, secondaryB.id, secondaryC.id, secondaryArchived.id]);
    assert.equal(positions.get(secondaryA.id), 1);
    assert.equal(positions.get(secondaryArchived.id), 2);
    assert.equal(positions.get(secondaryB.id), 3);
    assert.equal(positions.get(secondaryC.id), null);
    await assertUniqueFeaturedPositions();
  });

  await t.test("unpublish and republish enforce editorial permissions and valid statuses", async () => {
    await cleanup();
    const published = await createPublishedNews("workflow-permissions", null);

    const authorUnpublish = await app.inject({
      method: "POST",
      url: `/api/v1/news/${published.id}/archive`,
      headers: authHeader(authorToken),
    });
    assert.equal(authorUnpublish.statusCode, 403);

    const ownAdminPublished = await prisma.news.create({
      data: {
        title: "Featured Test Own Admin Published",
        slug: `${testSlugPrefix}-own-admin-published`,
        summary: "Resumo completo da noticia own admin.",
        content: "<p>Conteudo completo da noticia own admin.</p>",
        status: "PUBLISHED",
        authorId: adminAuthor.id,
        primaryCategoryId: categoryId,
        publishedById: reviewer.id,
        publishedAt: new Date(),
        categories: {
          create: {
            categoryId,
          },
        },
      },
    });

    const ownAdminUnpublish = await app.inject({
      method: "POST",
      url: `/api/v1/news/${ownAdminPublished.id}/archive`,
      headers: authHeader(adminAuthorToken),
    });
    assert.equal(ownAdminUnpublish.statusCode, 403);

    const invalidUnpublish = await app.inject({
      method: "POST",
      url: `/api/v1/news/${(await createApprovedNews("invalid-unpublish")).id}/archive`,
      headers: authHeader(reviewerToken),
    });
    assert.equal(invalidUnpublish.statusCode, 409);

    const unpublished = await app.inject({
      method: "POST",
      url: `/api/v1/news/${published.id}/archive`,
      headers: authHeader(adminPublisherToken),
    });
    assert.equal(unpublished.statusCode, 200);
    assert.equal(unpublished.json().status, "ARCHIVED");

    const authorRepublish = await app.inject({
      method: "POST",
      url: `/api/v1/news/${published.id}/publish`,
      headers: authHeader(authorToken),
      payload: {
        featuredPosition: null,
      },
    });
    assert.equal(authorRepublish.statusCode, 403);

    const invalidRepublish = await app.inject({
      method: "POST",
      url: `/api/v1/news/${ownAdminPublished.id}/publish`,
      headers: authHeader(reviewerToken),
      payload: {
        featuredPosition: null,
      },
    });
    assert.equal(invalidRepublish.statusCode, 409);

    const reviewerRepublish = await app.inject({
      method: "POST",
      url: `/api/v1/news/${published.id}/publish`,
      headers: authHeader(reviewerToken),
      payload: {
        featuredPosition: null,
      },
    });
    assert.equal(reviewerRepublish.statusCode, 200);
    assert.equal(reviewerRepublish.json().status, "PUBLISHED");
  });

  await t.test("only authorized non-authors can publish or promote featured news", async () => {
    await cleanup();
    const approved = await createApprovedNews("permissions-author");
    const authorPublish = await app.inject({
      method: "POST",
      url: `/api/v1/news/${approved.id}/publish`,
      headers: authHeader(authorToken),
      payload: {
        featuredPosition: 1,
      },
    });

    assert.equal(authorPublish.statusCode, 403);

    const ownAdminNews = await createApprovedNews("permissions-admin-own", adminAuthor);
    const adminPublishOwn = await app.inject({
      method: "POST",
      url: `/api/v1/news/${ownAdminNews.id}/publish`,
      headers: authHeader(adminAuthorToken),
      payload: {
        featuredPosition: 1,
      },
    });

    assert.equal(adminPublishOwn.statusCode, 403);

    const adminPublishOther = await app.inject({
      method: "POST",
      url: `/api/v1/news/${approved.id}/publish`,
      headers: authHeader(adminPublisherToken),
      payload: {
        featuredPosition: null,
      },
    });

    assert.equal(adminPublishOther.statusCode, 200);
    assert.equal(adminPublishOther.json().status, "PUBLISHED");
    assert.equal(adminPublishOther.json().publishedById, adminPublisher.id);

    const published = await createPublishedNews("permissions-published", null);
    const authorFeature = await app.inject({
      method: "POST",
      url: `/api/v1/news/${published.id}/feature`,
      headers: authHeader(authorToken),
      payload: {
        featuredPosition: 1,
      },
    });

    assert.equal(authorFeature.statusCode, 403);

    const reviewerFeature = await app.inject({
      method: "POST",
      url: `/api/v1/news/${published.id}/feature`,
      headers: authHeader(reviewerToken),
      payload: {
        featuredPosition: 1,
      },
    });

    assert.equal(reviewerFeature.statusCode, 200);
    assert.equal(reviewerFeature.json().featuredPosition, 1);
  });

  await t.test("public API returns only published news with featuredPosition", async () => {
    await cleanup();
    const published = await createPublishedNews("public-published", 1);
    const approved = await createApprovedNews("public-approved");

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/news",
    });

    assert.equal(list.statusCode, 200);
    const listed = list.json().items.find((item: { id: string }) => item.id === published.id);
    assert.equal(list.json().items.some((item: { id: string }) => item.id === approved.id), false);
    assert.equal(listed.featuredPosition, 1);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/news/${published.slug}`,
    });

    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().featuredPosition, 1);
  });
});

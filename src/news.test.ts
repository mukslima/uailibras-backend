import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { normalizeSlug } from "./utils/normalize";
import { setStorageServiceForTests, type StorageService } from "./services/storage";

process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-characters";
process.env.JWT_ACCESS_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";

let app: FastifyInstance;
let prisma: PrismaClient;
let hashPassword: (password: string) => Promise<string>;

const password = "password1234";
const testEmailDomain = "@news.test";
const testSlugPrefix = "news-test";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/luzMNgAAAABJRU5ErkJggg==",
  "base64",
);

const fakeStorage: StorageService = {
  async upload(input) {
    return {
      url: `https://cdn.test/${input.key}`,
    };
  },
  async delete() {
    return undefined;
  },
};

function authHeader(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
  };
}

function multipartBody(name: string, filename: string, contentType: string, content: Buffer) {
  const boundary = `----uailibras-${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  return {
    body,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
  };
}

async function createTestUser(role: "ADMIN" | "AUTHOR" | "REVIEWER", suffix: string) {
  return prisma.user.create({
    data: {
      username: `news.${suffix}`,
      name: `News ${suffix}`,
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

async function createCategory(name: string) {
  return prisma.category.upsert({
    where: {
      slug: normalizeSlug(name),
    },
    update: {
      name,
      active: true,
    },
    create: {
      name,
      slug: normalizeSlug(name),
      active: true,
    },
  });
}

async function cleanup() {
  await prisma.news.deleteMany({
    where: {
      slug: {
        startsWith: testSlugPrefix,
      },
    },
  });
  await prisma.media.deleteMany({
    where: {
      uploadedBy: {
        email: {
          endsWith: testEmailDomain,
        },
      },
    },
  });
  await prisma.tag.deleteMany({
    where: {
      slug: {
        startsWith: testSlugPrefix,
      },
    },
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: testEmailDomain,
      },
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
  setStorageServiceForTests(fakeStorage);

  await app.ready();
  await cleanup();
});

after(async () => {
  await cleanup();
  setStorageServiceForTests(undefined);
  await app.close();
  await prisma.$disconnect();
});

test("editorial news workflow, visibility, taxonomy, and media upload", async (t) => {
  const category = await createCategory("News Test Festival");
  const secondaryCategory = await createCategory("News Test Evento");
  const author = await createTestUser("AUTHOR", "author");
  const otherAuthor = await createTestUser("AUTHOR", "other-author");
  const reviewer = await createTestUser("REVIEWER", "reviewer");
  const admin = await createTestUser("ADMIN", "admin");
  const adminAuthor = await createTestUser("ADMIN", "admin-author");
  const authorToken = await loginAs(author.email);
  const otherAuthorToken = await loginAs(otherAuthor.email);
  const reviewerToken = await loginAs(reviewer.email);
  const adminToken = await loginAs(admin.email);
  const adminAuthorToken = await loginAs(adminAuthor.email);

  let newsId = "";
  let adminNewsId = "";

  await t.test("AUTHOR creates news, REVIEWER cannot create, and new news starts as DRAFT", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/news",
      headers: authHeader(authorToken),
      payload: {
        title: "News Test Festival Libras",
        slug: `${testSlugPrefix}-festival-libras`,
        summary: "Resumo completo para card da notícia de teste.",
        content: "<p>Conteúdo editorial <script>alert(1)</script> com Libras.</p>",
        primaryCategoryId: category.id,
        categoryIds: [secondaryCategory.id],
        tags: ["News Test Libras", "News Test Libras"],
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().status, "DRAFT");
    assert.equal(response.json().authorId, author.id);
    assert.equal(response.json().content.includes("<script>"), false);
    assert.ok(response.json().categories.some((item: { categoryId: string }) => item.categoryId === category.id));
    newsId = response.json().id;

    const reviewerCreate = await app.inject({
      method: "POST",
      url: "/api/v1/news",
      headers: authHeader(reviewerToken),
      payload: {
        title: "Reviewer News",
        slug: `${testSlugPrefix}-reviewer-news`,
        summary: "Resumo completo para card da notícia de teste.",
        content: "Conteúdo editorial suficiente.",
        primaryCategoryId: category.id,
      },
    });

    assert.equal(reviewerCreate.statusCode, 403);
  });

  await t.test("AUTHOR edits own DRAFT, cannot edit someone else's, and REVIEWER cannot edit", async () => {
    const adminDraftEdit = await app.inject({
      method: "PATCH",
      url: `/api/v1/news/${newsId}`,
      headers: authHeader(adminToken),
      payload: {
        summary: "Resumo alterado por admin em rascunho.",
      },
    });

    assert.equal(adminDraftEdit.statusCode, 200);

    const ownEdit = await app.inject({
      method: "PATCH",
      url: `/api/v1/news/${newsId}`,
      headers: authHeader(authorToken),
      payload: {
        summary: "Resumo alterado para card da notícia de teste.",
        categoryIds: [secondaryCategory.id],
        tags: ["News Test Libras", "News Test Acessibilidade"],
      },
    });

    assert.equal(ownEdit.statusCode, 200);
    assert.equal(ownEdit.json().summary, "Resumo alterado para card da notícia de teste.");
    assert.equal(
      ownEdit.json().categories.some((item: { categoryId: string }) => item.categoryId === category.id),
      true,
    );

    const otherEdit = await app.inject({
      method: "PATCH",
      url: `/api/v1/news/${newsId}`,
      headers: authHeader(otherAuthorToken),
      payload: {
        summary: "Tentativa indevida de alteração.",
      },
    });

    assert.equal(otherEdit.statusCode, 403);

    const reviewerEdit = await app.inject({
      method: "PATCH",
      url: `/api/v1/news/${newsId}`,
      headers: authHeader(reviewerToken),
      payload: {
        summary: "Tentativa indevida de alteração.",
      },
    });

    assert.equal(reviewerEdit.statusCode, 403);
  });

  await t.test("admin detail scopes are preserved and REVIEWER cannot read third-party DRAFT", async () => {
    const reviewerDraftDetail = await app.inject({
      method: "GET",
      url: `/api/v1/admin/news/${newsId}`,
      headers: authHeader(reviewerToken),
    });

    assert.equal(reviewerDraftDetail.statusCode, 403);

    const authorOwnDraftDetail = await app.inject({
      method: "GET",
      url: `/api/v1/admin/news/${newsId}`,
      headers: authHeader(authorToken),
    });

    assert.equal(authorOwnDraftDetail.statusCode, 200);

    const adminDraftDetail = await app.inject({
      method: "GET",
      url: `/api/v1/admin/news/${newsId}`,
      headers: authHeader(adminToken),
    });

    assert.equal(adminDraftDetail.statusCode, 200);
  });

  await t.test("AUTHOR submits news and unpublished statuses stay private", async () => {
    const submit = await app.inject({
      method: "POST",
      url: `/api/v1/news/${newsId}/submit`,
      headers: authHeader(authorToken),
    });

    assert.equal(submit.statusCode, 200);
    assert.equal(submit.json().status, "IN_REVIEW");

    const adminInReviewEdit = await app.inject({
      method: "PATCH",
      url: `/api/v1/news/${newsId}`,
      headers: authHeader(adminToken),
      payload: {
        summary: "Resumo alterado por admin em revisao.",
      },
    });

    assert.equal(adminInReviewEdit.statusCode, 200);

    const reviewerInReviewDetail = await app.inject({
      method: "GET",
      url: `/api/v1/admin/news/${newsId}`,
      headers: authHeader(reviewerToken),
    });

    assert.equal(reviewerInReviewDetail.statusCode, 200);

    for (const statusUrl of ["/api/v1/news", "/api/v1/news/news-test-festival-libras"]) {
      const publicResponse = await app.inject({
        method: "GET",
        url: statusUrl,
      });

      if (statusUrl === "/api/v1/news") {
        assert.equal(publicResponse.json().items.some((item: { id: string }) => item.id === newsId), false);
      } else {
        assert.equal(publicResponse.statusCode, 404);
      }
    }
  });

  await t.test("author and ADMIN author cannot approve their own news", async () => {
    const authorApprove = await app.inject({
      method: "POST",
      url: `/api/v1/news/${newsId}/approve`,
      headers: authHeader(authorToken),
      payload: {},
    });

    assert.equal(authorApprove.statusCode, 403);

    const adminCreate = await app.inject({
      method: "POST",
      url: "/api/v1/news",
      headers: authHeader(adminAuthorToken),
      payload: {
        title: "News Test Admin Own",
        slug: `${testSlugPrefix}-admin-own`,
        summary: "Resumo completo para card da notícia de teste.",
        content: "Conteúdo editorial suficiente.",
        primaryCategoryId: category.id,
      },
    });
    adminNewsId = adminCreate.json().id;

    await app.inject({
      method: "POST",
      url: `/api/v1/news/${adminNewsId}/submit`,
      headers: authHeader(adminAuthorToken),
    });

    const adminApproveOwn = await app.inject({
      method: "POST",
      url: `/api/v1/news/${adminNewsId}/approve`,
      headers: authHeader(adminAuthorToken),
      payload: {},
    });

    assert.equal(adminApproveOwn.statusCode, 403);
  });

  await t.test("REVIEWER rejects only with comment, rejected news can be corrected and resubmitted", async () => {
    const noComment = await app.inject({
      method: "POST",
      url: `/api/v1/news/${newsId}/reject`,
      headers: authHeader(reviewerToken),
      payload: {},
    });

    assert.equal(noComment.statusCode, 400);

    const reject = await app.inject({
      method: "POST",
      url: `/api/v1/news/${newsId}/reject`,
      headers: authHeader(reviewerToken),
      payload: {
        comment: "Corrigir a data do evento.",
      },
    });

    assert.equal(reject.statusCode, 200);
    assert.equal(reject.json().status, "REJECTED");
    assert.equal(reject.json().reviews.some((review: { action: string }) => review.action === "REJECTED"), true);

    const adminRejectedEdit = await app.inject({
      method: "PATCH",
      url: `/api/v1/news/${newsId}`,
      headers: authHeader(adminToken),
      payload: {
        summary: "Resumo alterado por admin apos rejeicao.",
      },
    });

    assert.equal(adminRejectedEdit.statusCode, 200);

    const edit = await app.inject({
      method: "PATCH",
      url: `/api/v1/news/${newsId}`,
      headers: authHeader(authorToken),
      payload: {
        content: "Conteúdo corrigido depois da rejeição.",
      },
    });

    assert.equal(edit.statusCode, 200);

    const resubmit = await app.inject({
      method: "POST",
      url: `/api/v1/news/${newsId}/submit`,
      headers: authHeader(authorToken),
    });

    assert.equal(resubmit.statusCode, 200);
    assert.equal(resubmit.json().status, "IN_REVIEW");
  });

  await t.test("REVIEWER approves other author's news, only APPROVED can be published", async () => {
    const draftCreate = await app.inject({
      method: "POST",
      url: "/api/v1/news",
      headers: authHeader(authorToken),
      payload: {
        title: "News Test Draft Publish",
        slug: `${testSlugPrefix}-draft-publish`,
        summary: "Resumo completo para card da notícia de teste.",
        content: "Conteúdo editorial suficiente.",
        primaryCategoryId: category.id,
      },
    });

    const draftPublish = await app.inject({
      method: "POST",
      url: `/api/v1/news/${draftCreate.json().id}/publish`,
      headers: authHeader(reviewerToken),
    });

    assert.equal(draftPublish.statusCode, 409);

    const inReviewPublish = await app.inject({
      method: "POST",
      url: `/api/v1/news/${newsId}/publish`,
      headers: authHeader(reviewerToken),
    });

    assert.equal(inReviewPublish.statusCode, 409);

    const approve = await app.inject({
      method: "POST",
      url: `/api/v1/news/${newsId}/approve`,
      headers: authHeader(reviewerToken),
      payload: {
        comment: "Pode publicar.",
      },
    });

    assert.equal(approve.statusCode, 200);
    assert.equal(approve.json().status, "APPROVED");
    assert.equal(approve.json().approvedById, reviewer.id);

    const adminApprovedEdit = await app.inject({
      method: "PATCH",
      url: `/api/v1/news/${newsId}`,
      headers: authHeader(adminToken),
      payload: {
        summary: "Resumo alterado por admin aprovado.",
      },
    });

    assert.equal(adminApprovedEdit.statusCode, 200);

    const publish = await app.inject({
      method: "POST",
      url: `/api/v1/news/${newsId}/publish`,
      headers: authHeader(reviewerToken),
    });

    assert.equal(publish.statusCode, 200);
    assert.equal(publish.json().status, "PUBLISHED");
    assert.equal(publish.json().publishedById, reviewer.id);
    assert.ok(publish.json().publishedAt);

    const adminPublishedEdit = await app.inject({
      method: "PATCH",
      url: `/api/v1/news/${newsId}`,
      headers: authHeader(adminToken),
      payload: {
        summary: "Tentativa indevida em noticia publicada.",
      },
    });

    assert.equal(adminPublishedEdit.statusCode, 409);
  });

  await t.test("PUBLISHED appears publicly and ARCHIVED disappears", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/news",
    });

    assert.equal(list.statusCode, 200);
    assert.equal(list.json().items.some((item: { id: string }) => item.id === newsId), true);

    const detail = await app.inject({
      method: "GET",
      url: "/api/v1/news/news-test-festival-libras",
    });

    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().id, newsId);
    assert.equal(detail.json().content.includes("Conteudo republicado com seguranca"), false);
    assert.equal(detail.json().author.email, undefined);
    assert.equal(detail.json().author.passwordHash, undefined);
    assert.equal(detail.json().coverImage?.storageKey, undefined);
    assert.equal(detail.json().reviews, undefined);

    const revision = await app.inject({
      method: "POST",
      url: `/api/v1/news/${newsId}/revision`,
      headers: authHeader(authorToken),
    });

    assert.equal(revision.statusCode, 200);
    assert.equal(revision.json().status, "DRAFT");
    assert.equal(revision.json().revisionOfId, newsId);
    assert.notEqual(revision.json().id, newsId);

    const publicBeforeRepublish = await app.inject({
      method: "GET",
      url: "/api/v1/news/news-test-festival-libras",
    });

    assert.equal(publicBeforeRepublish.statusCode, 200);
    assert.equal(publicBeforeRepublish.json().content.includes("Conteudo republicado com seguranca"), false);

    const directPublishedPatch = await app.inject({
      method: "PATCH",
      url: `/api/v1/news/${newsId}`,
      headers: authHeader(adminToken),
      payload: {
        summary: "Tentativa direta antes de republicar.",
      },
    });

    assert.equal(directPublishedPatch.statusCode, 409);

    const editRevision = await app.inject({
      method: "PATCH",
      url: `/api/v1/news/${revision.json().id}`,
      headers: authHeader(authorToken),
      payload: {
        content:
          '<p class="text-align-center">Conteudo republicado com seguranca.</p><img src="https://cdn.test/uailibras/news/image-a.png" alt="Imagem A" class="image-size-small image-align-right" onerror="alert(1)"><p>Texto contorna a primeira imagem.</p><img src="https://cdn.test/uailibras/news/image-b.png" alt="Imagem B" class="image-size-medium image-align-left"><img src="https://cdn.test/uailibras/news/image-c.png" alt="Imagem C" class="image-size-large image-align-center bad-class">',
      },
    });

    assert.equal(editRevision.statusCode, 200);
    assert.equal(editRevision.json().content.includes("text-align-center"), true);
    assert.equal(editRevision.json().content.includes("image-size-small"), true);
    assert.equal(editRevision.json().content.includes("image-align-right"), true);
    assert.equal(editRevision.json().content.includes("image-size-medium"), true);
    assert.equal(editRevision.json().content.includes("image-align-left"), true);
    assert.equal(editRevision.json().content.includes("image-size-large"), true);
    assert.equal(editRevision.json().content.includes("image-align-center"), true);
    assert.equal(editRevision.json().content.includes("bad-class"), false);
    assert.equal(editRevision.json().content.includes("onerror"), false);

    const submitRevision = await app.inject({
      method: "POST",
      url: `/api/v1/news/${revision.json().id}/submit`,
      headers: authHeader(authorToken),
    });

    assert.equal(submitRevision.statusCode, 200);
    assert.equal(submitRevision.json().status, "IN_REVIEW");

    const approveRevision = await app.inject({
      method: "POST",
      url: `/api/v1/news/${revision.json().id}/approve`,
      headers: authHeader(reviewerToken),
      payload: {
        comment: "Republicacao aprovada.",
      },
    });

    assert.equal(approveRevision.statusCode, 200);
    assert.equal(approveRevision.json().status, "APPROVED");

    const republish = await app.inject({
      method: "POST",
      url: `/api/v1/news/${revision.json().id}/publish`,
      headers: authHeader(reviewerToken),
      payload: {
        featuredPosition: null,
      },
    });

    assert.equal(republish.statusCode, 200);
    assert.equal(republish.json().id, newsId);
    assert.equal(republish.json().status, "PUBLISHED");
    assert.equal(republish.json().content.includes("Conteudo republicado com seguranca"), true);

    const revisionAfterPublish = await prisma.news.findUniqueOrThrow({
      where: {
        id: revision.json().id,
      },
    });

    assert.equal(revisionAfterPublish.status, "ARCHIVED");

    const publicAfterRepublish = await app.inject({
      method: "GET",
      url: "/api/v1/news/news-test-festival-libras",
    });

    assert.equal(publicAfterRepublish.statusCode, 200);
    assert.equal(publicAfterRepublish.json().id, newsId);
    assert.equal(publicAfterRepublish.json().content.includes("Conteudo republicado com seguranca"), true);

    const archive = await app.inject({
      method: "POST",
      url: `/api/v1/news/${newsId}/archive`,
      headers: authHeader(adminToken),
    });

    assert.equal(archive.statusCode, 200);
    assert.equal(archive.json().status, "ARCHIVED");

    const adminArchivedEdit = await app.inject({
      method: "PATCH",
      url: `/api/v1/news/${newsId}`,
      headers: authHeader(adminToken),
      payload: {
        summary: "Tentativa indevida em noticia arquivada.",
      },
    });

    assert.equal(adminArchivedEdit.statusCode, 409);

    const archivedDetail = await app.inject({
      method: "GET",
      url: "/api/v1/news/news-test-festival-libras",
    });

    assert.equal(archivedDetail.statusCode, 404);
  });

  await t.test("tags are normalized/deduplicated", async () => {
    const tags = await prisma.tag.findMany({
      where: {
        slug: {
          in: ["news-test-libras", "news-test-acessibilidade"],
        },
      },
    });

    assert.equal(tags.length, 2);
  });

  await t.test("media upload rejects invalid/oversized files and accepts allowed images", async () => {
    const invalid = multipartBody("file", "bad.html", "text/html", Buffer.from("<html></html>"));
    const invalidResponse = await app.inject({
      method: "POST",
      url: "/api/v1/media",
      headers: {
        ...authHeader(authorToken),
        ...invalid.headers,
      },
      payload: invalid.body,
    });

    assert.equal(invalidResponse.statusCode, 400);

    const oversized = multipartBody("file", "huge.png", "image/png", Buffer.alloc(10 * 1024 * 1024 + 1));
    const oversizedResponse = await app.inject({
      method: "POST",
      url: "/api/v1/media",
      headers: {
        ...authHeader(authorToken),
        ...oversized.headers,
      },
      payload: oversized.body,
    });

    assert.ok([400, 413].includes(oversizedResponse.statusCode));

    const valid = multipartBody("file", "image.png", "image/png", onePixelPng);
    const validResponse = await app.inject({
      method: "POST",
      url: "/api/v1/media",
      headers: {
        ...authHeader(authorToken),
        ...valid.headers,
      },
      payload: valid.body,
    });

    assert.equal(validResponse.statusCode, 201);
    assert.equal(validResponse.json().mimeType, "image/png");
    assert.equal(validResponse.json().uploadedById, author.id);
    assert.match(validResponse.json().storageKey, /^uailibras\/news\//);
    assert.match(validResponse.json().url, /^https:\/\/cdn\.test\/uailibras\/news\//);
  });
});

import { Prisma, type NewsStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { sanitizeRichText } from "../utils/content";
import { normalizeSlug } from "../utils/normalize";
import { findOrCreateTags } from "./tags";
import { getPublicUserSelect, type PublicUser } from "./users";

type EditorialUser = PublicUser;

type NewsWriteInput = {
  title?: string;
  slug?: string;
  summary?: string;
  content?: string;
  primaryCategoryId?: string;
  categoryIds?: string[];
  tagIds?: string[];
  tags?: string[];
  coverImageId?: string | null;
  mediaIds?: string[];
  requestedFeaturedPosition?: 1 | 2 | null;
};

type CreateNewsInput = Required<Pick<NewsWriteInput, "title" | "summary" | "content" | "primaryCategoryId">> &
  NewsWriteInput;

type ListPublicNewsInput = {
  page: number;
  pageSize: number;
  category?: string;
  tag?: string;
  search?: string;
};

type ListAdminNewsInput = {
  page: number;
  pageSize: number;
  status?: NewsStatus;
};

const safeUserSelect = getPublicUserSelect();

const newsInclude = {
  author: {
    select: safeUserSelect,
  },
  approvedBy: {
    select: safeUserSelect,
  },
  publishedBy: {
    select: safeUserSelect,
  },
  primaryCategory: true,
  coverImage: true,
  categories: {
    include: {
      category: true,
    },
  },
  tags: {
    include: {
      tag: true,
    },
  },
  media: {
    include: {
      media: true,
    },
  },
  reviews: {
    orderBy: {
      createdAt: "asc",
    },
    include: {
      reviewer: {
        select: safeUserSelect,
      },
    },
  },
} satisfies Prisma.NewsInclude;

const publicNewsSelect = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  content: true,
  featuredPosition: true,
  publishedAt: true,
  author: {
    select: {
      id: true,
      username: true,
      name: true,
    },
  },
  primaryCategory: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  coverImage: {
    select: {
      id: true,
      url: true,
      originalName: true,
      width: true,
      height: true,
    },
  },
  categories: {
    select: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  },
  tags: {
    select: {
      tag: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  },
} satisfies Prisma.NewsSelect;

function forbidden() {
  return Object.assign(new Error("Forbidden"), { statusCode: 403 });
}

function invalidTransition(message: string) {
  return Object.assign(new Error(message), { statusCode: 409 });
}

function notFound() {
  return Object.assign(new Error("News not found"), { statusCode: 404 });
}

function editableByAuthor(status: NewsStatus) {
  return status === "DRAFT" || status === "REJECTED";
}

function editableByAdmin(status: NewsStatus) {
  return !["PUBLISHED", "ARCHIVED"].includes(status);
}

function normalizeUnique(values: string[] | undefined) {
  return [...new Set(values ?? [])];
}

function normalizeNewsSlug(title: string, slug?: string) {
  const normalized = normalizeSlug(slug ?? title);

  if (!normalized) {
    throw Object.assign(new Error("Invalid slug"), { statusCode: 400 });
  }

  return normalized;
}

async function ensureActiveCategories(categoryIds: string[]) {
  const categories = await prisma.category.findMany({
    where: {
      id: {
        in: categoryIds,
      },
      active: true,
    },
  });

  if (categories.length !== categoryIds.length) {
    throw Object.assign(new Error("Invalid category"), { statusCode: 400 });
  }
}

async function ensureMediaExists(mediaIds: string[]) {
  if (mediaIds.length === 0) return;

  const count = await prisma.media.count({
    where: {
      id: {
        in: mediaIds,
      },
    },
  });

  if (count !== mediaIds.length) {
    throw Object.assign(new Error("Invalid media"), { statusCode: 400 });
  }
}

async function resolveTagIds(input: Pick<NewsWriteInput, "tagIds" | "tags">) {
  const createdTags = await findOrCreateTags(input.tags ?? []);
  return normalizeUnique([...(input.tagIds ?? []), ...createdTags.map((tag) => tag.id)]);
}

async function buildRelations(input: NewsWriteInput) {
  const primaryCategoryId = input.primaryCategoryId;
  const categoryIds = primaryCategoryId
    ? normalizeUnique([primaryCategoryId, ...(input.categoryIds ?? [])])
    : input.categoryIds
      ? normalizeUnique(input.categoryIds)
      : undefined;
  const tagIds = input.tagIds || input.tags ? await resolveTagIds(input) : undefined;
  const mediaIds = input.mediaIds ? normalizeUnique(input.mediaIds) : undefined;
  const allMediaIds = normalizeUnique([...(mediaIds ?? []), ...(input.coverImageId ? [input.coverImageId] : [])]);

  if (categoryIds) await ensureActiveCategories(categoryIds);
  await ensureMediaExists(allMediaIds);

  return {
    categoryIds,
    tagIds,
    mediaIds,
  };
}

function handleNewsWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw Object.assign(new Error("News slug already exists"), { statusCode: 409 });
    }

    if (error.code === "P2025") {
      throw notFound();
    }
  }

  throw error;
}

async function getNewsOrThrow(id: string) {
  const news = await prisma.news.findUnique({
    where: { id },
  });

  if (!news) {
    throw notFound();
  }

  return news;
}

function assertCanReview(user: EditorialUser, authorId: string) {
  if (!["ADMIN", "REVIEWER"].includes(user.role)) {
    throw forbidden();
  }

  if (user.id === authorId) {
    throw forbidden();
  }
}

type FeaturePosition = 1 | 2 | null;
type NewsTransaction = Prisma.TransactionClient;

async function applyFeaturedPosition(tx: NewsTransaction, newsId: string, featuredPosition: FeaturePosition) {
  if (featuredPosition === null) {
    await tx.news.update({
      where: { id: newsId },
      data: { featuredPosition: null },
    });
    return;
  }

  const occupied = await tx.news.findMany({
    where: {
      featuredPosition: featuredPosition === 1 ? { in: [1, 2, 3] } : { in: [2, 3] },
      NOT: {
        id: newsId,
      },
    },
    select: {
      id: true,
      featuredPosition: true,
    },
  });

  await tx.news.updateMany({
    where: {
      OR: [
        { id: newsId },
        {
          id: {
            in: occupied.map((news) => news.id),
          },
        },
      ],
    },
    data: {
      featuredPosition: null,
    },
  });

  if (featuredPosition === 1) {
    const currentOne = occupied.find((news) => news.featuredPosition === 1);
    const currentTwo = occupied.find((news) => news.featuredPosition === 2);

    if (currentTwo) {
      await tx.news.update({ where: { id: currentTwo.id }, data: { featuredPosition: 3 } });
    }

    if (currentOne) {
      await tx.news.update({ where: { id: currentOne.id }, data: { featuredPosition: 2 } });
    }
  }

  if (featuredPosition === 2) {
    const currentTwo = occupied.find((news) => news.featuredPosition === 2);

    if (currentTwo) {
      await tx.news.update({ where: { id: currentTwo.id }, data: { featuredPosition: 3 } });
    }
  }

  await tx.news.update({
    where: { id: newsId },
    data: { featuredPosition },
  });
}

async function runFeaturedTransaction<T>(operation: (tx: NewsTransaction) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        attempt < 2 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034")
      ) {
        continue;
      }

      throw error;
    }
  }

  throw Object.assign(new Error("Could not apply featured position"), { statusCode: 409 });
}

export async function createNews(input: CreateNewsInput, user: EditorialUser) {
  if (!["ADMIN", "AUTHOR"].includes(user.role)) {
    throw forbidden();
  }

  const relations = await buildRelations(input);

  try {
    return await prisma.news.create({
      data: {
        title: input.title.trim(),
        slug: normalizeNewsSlug(input.title, input.slug),
        summary: input.summary.trim(),
        content: sanitizeRichText(input.content),
        authorId: user.id,
        primaryCategoryId: input.primaryCategoryId,
        coverImageId: input.coverImageId ?? undefined,
        requestedFeaturedPosition: input.requestedFeaturedPosition ?? null,
        categories: {
          create: relations.categoryIds!.map((categoryId) => ({
            categoryId,
          })),
        },
        tags: relations.tagIds
          ? {
              create: relations.tagIds.map((tagId) => ({
                tagId,
              })),
            }
          : undefined,
        media: relations.mediaIds
          ? {
              create: relations.mediaIds.map((mediaId) => ({
                mediaId,
              })),
            }
          : undefined,
      },
      include: newsInclude,
    });
  } catch (error) {
    handleNewsWriteError(error);
  }
}

export async function updateNews(id: string, input: NewsWriteInput, user: EditorialUser) {
  const existing = await getNewsOrThrow(id);

  if (user.role === "REVIEWER") {
    throw forbidden();
  }

  if (user.role === "AUTHOR" && existing.authorId !== user.id) {
    throw forbidden();
  }

  if (user.role === "AUTHOR" && !editableByAuthor(existing.status)) {
    throw invalidTransition("News cannot be edited in the current status");
  }

  if (user.role === "ADMIN" && !editableByAdmin(existing.status)) {
    throw invalidTransition("News cannot be edited in the current status");
  }

  const relations = await buildRelations({
    ...input,
    primaryCategoryId: input.primaryCategoryId ?? (input.categoryIds ? existing.primaryCategoryId ?? undefined : undefined),
  });

  try {
    return await prisma.$transaction(async (tx) => {
      if (relations.categoryIds) {
        await tx.newsCategory.deleteMany({ where: { newsId: id } });
        await tx.newsCategory.createMany({
          data: relations.categoryIds.map((categoryId) => ({ newsId: id, categoryId })),
          skipDuplicates: true,
        });
      }

      if (relations.tagIds) {
        await tx.newsTag.deleteMany({ where: { newsId: id } });
        await tx.newsTag.createMany({
          data: relations.tagIds.map((tagId) => ({ newsId: id, tagId })),
          skipDuplicates: true,
        });
      }

      if (relations.mediaIds) {
        await tx.newsMedia.deleteMany({ where: { newsId: id } });
        await tx.newsMedia.createMany({
          data: relations.mediaIds.map((mediaId) => ({ newsId: id, mediaId })),
          skipDuplicates: true,
        });
      }

      return tx.news.update({
        where: { id },
        data: {
          title: input.title?.trim(),
          slug: input.slug ? normalizeNewsSlug(input.title ?? existing.title, input.slug) : undefined,
          summary: input.summary?.trim(),
          content: input.content ? sanitizeRichText(input.content) : undefined,
          primaryCategoryId: input.primaryCategoryId,
          coverImageId: input.coverImageId,
          requestedFeaturedPosition: input.requestedFeaturedPosition,
          approvedById: existing.status === "REJECTED" ? null : undefined,
        },
        include: newsInclude,
      });
    });
  } catch (error) {
    handleNewsWriteError(error);
  }
}

export async function submitNews(id: string, user: EditorialUser) {
  const news = await getNewsOrThrow(id);

  if (news.authorId !== user.id) {
    throw forbidden();
  }

  if (!["DRAFT", "REJECTED"].includes(news.status)) {
    throw invalidTransition("Only draft or rejected news can be submitted");
  }

  if (!news.title.trim() || !news.summary.trim() || !news.content.trim() || !news.primaryCategoryId) {
    throw Object.assign(new Error("News is missing required publication fields"), { statusCode: 400 });
  }

  const hasPrimaryCategory = await prisma.newsCategory.findUnique({
    where: {
      newsId_categoryId: {
        newsId: id,
        categoryId: news.primaryCategoryId,
      },
    },
  });

  if (!hasPrimaryCategory) {
    throw Object.assign(new Error("Primary category must be associated with the news"), { statusCode: 400 });
  }

  return prisma.news.update({
    where: { id },
    data: {
      status: "IN_REVIEW",
    },
    include: newsInclude,
  });
}

export async function rejectNews(id: string, comment: string, user: EditorialUser) {
  const news = await getNewsOrThrow(id);
  assertCanReview(user, news.authorId);

  if (news.status !== "IN_REVIEW") {
    throw invalidTransition("Only news in review can be rejected");
  }

  return prisma.$transaction(async (tx) => {
    await tx.newsReview.create({
      data: {
        newsId: id,
        reviewerId: user.id,
        action: "REJECTED",
        comment: comment.trim(),
      },
    });

    return tx.news.update({
      where: { id },
      data: {
        status: "REJECTED",
        approvedById: null,
      },
      include: newsInclude,
    });
  });
}

export async function approveNews(id: string, comment: string | undefined, user: EditorialUser) {
  const news = await getNewsOrThrow(id);
  assertCanReview(user, news.authorId);

  if (news.status !== "IN_REVIEW") {
    throw invalidTransition("Only news in review can be approved");
  }

  return prisma.$transaction(async (tx) => {
    await tx.newsReview.create({
      data: {
        newsId: id,
        reviewerId: user.id,
        action: "APPROVED",
        comment: comment?.trim() || null,
      },
    });

    return tx.news.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: user.id,
      },
      include: newsInclude,
    });
  });
}

export async function publishNews(id: string, user: EditorialUser, featuredPosition: FeaturePosition = null) {
  const news = await getNewsOrThrow(id);
  assertCanReview(user, news.authorId);

  if (news.status !== "APPROVED") {
    throw invalidTransition("Only approved news can be published");
  }

  return runFeaturedTransaction(async (tx) => {
    await tx.news.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedById: user.id,
        publishedAt: new Date(),
        featuredPosition: null,
      },
    });

    await applyFeaturedPosition(tx, id, featuredPosition);

    return tx.news.findUniqueOrThrow({
      where: { id },
      include: newsInclude,
    });
  });
}

export async function featureNews(id: string, featuredPosition: FeaturePosition, user: EditorialUser) {
  const news = await getNewsOrThrow(id);
  assertCanReview(user, news.authorId);

  if (news.status !== "PUBLISHED") {
    throw invalidTransition("Only published news can be featured");
  }

  return runFeaturedTransaction(async (tx) => {
    await applyFeaturedPosition(tx, id, featuredPosition);

    return tx.news.findUniqueOrThrow({
      where: { id },
      include: newsInclude,
    });
  });
}

export async function archiveNews(id: string, user: EditorialUser) {
  const news = await getNewsOrThrow(id);

  if (user.role !== "ADMIN" && news.authorId !== user.id) {
    throw forbidden();
  }

  if (user.role === "AUTHOR" && news.status !== "PUBLISHED") {
    throw invalidTransition("Authors can archive only published news");
  }

  return prisma.news.update({
    where: { id },
    data: {
      status: "ARCHIVED",
      featuredPosition: null,
    },
    include: newsInclude,
  });
}

export async function listPublicNews(input: ListPublicNewsInput) {
  const where: Prisma.NewsWhereInput = {
    status: "PUBLISHED",
    ...(input.category
      ? {
          categories: {
            some: {
              category: {
                slug: normalizeSlug(input.category),
              },
            },
          },
        }
      : {}),
    ...(input.tag
      ? {
          tags: {
            some: {
              tag: {
                slug: normalizeSlug(input.tag),
              },
            },
          },
        }
      : {}),
    ...(input.search
      ? {
          OR: [
            { title: { contains: input.search, mode: "insensitive" } },
            { summary: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.news.findMany({
      where,
      orderBy: {
        publishedAt: "desc",
      },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: publicNewsSelect,
    }),
    prisma.news.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}

export async function getPublicNewsBySlug(slug: string) {
  const news = await prisma.news.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
    },
    select: publicNewsSelect,
  });

  if (!news) {
    throw notFound();
  }

  return news;
}

export async function listAdminNews(input: ListAdminNewsInput, user: EditorialUser) {
  const where: Prisma.NewsWhereInput = {
    status: input.status,
    ...(user.role === "AUTHOR" ? { authorId: user.id } : {}),
    ...(user.role === "REVIEWER" ? { status: input.status ?? "IN_REVIEW" } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.news.findMany({
      where,
      orderBy: {
        updatedAt: "desc",
      },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: newsInclude,
    }),
    prisma.news.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}

export async function getAdminNewsById(id: string, user: EditorialUser) {
  const news = await prisma.news.findUnique({
    where: { id },
    include: newsInclude,
  });

  if (!news) {
    throw notFound();
  }

  if (user.role === "AUTHOR" && news.authorId !== user.id) {
    throw forbidden();
  }

  if (user.role === "REVIEWER" && news.status === "DRAFT") {
    throw forbidden();
  }

  return news;
}

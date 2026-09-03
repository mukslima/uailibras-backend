import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { normalizeDisplayName, normalizeSlug } from "../utils/normalize";

type CreateTagInput = {
  name: string;
  slug?: string;
};

function normalizeTagSlug(input: CreateTagInput) {
  const slug = normalizeSlug(input.slug ?? input.name);

  if (!slug) {
    throw Object.assign(new Error("Invalid slug"), { statusCode: 400 });
  }

  return slug;
}

function handleTagError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw Object.assign(new Error("Tag already exists"), { statusCode: 409 });
  }

  throw error;
}

export function listTags() {
  return prisma.tag.findMany({
    orderBy: {
      name: "asc",
    },
  });
}

export async function createTag(input: CreateTagInput) {
  try {
    return await prisma.tag.create({
      data: {
        name: normalizeDisplayName(input.name),
        slug: normalizeTagSlug(input),
      },
    });
  } catch (error) {
    handleTagError(error);
  }
}

export async function findOrCreateTags(names: string[]) {
  const uniqueNames = [...new Map(names.map((name) => [normalizeSlug(name), normalizeDisplayName(name)])).entries()].filter(
    ([slug]) => slug,
  );

  const tags = [];

  for (const [slug, name] of uniqueNames) {
    const tag = await prisma.tag.upsert({
      where: { slug },
      update: {
        name,
      },
      create: {
        name,
        slug,
      },
    });

    tags.push(tag);
  }

  return tags;
}

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { normalizeSlug } from "../utils/normalize";

type CreateCategoryInput = {
  name: string;
  slug?: string;
  active?: boolean;
};

type UpdateCategoryInput = {
  name?: string;
  slug?: string;
  active?: boolean;
};

function normalizeCategorySlug(input: CreateCategoryInput | UpdateCategoryInput) {
  const slugSource = input.slug ?? input.name;
  const slug = slugSource ? normalizeSlug(slugSource) : undefined;

  if (slugSource && !slug) {
    throw Object.assign(new Error("Invalid slug"), { statusCode: 400 });
  }

  return slug;
}

function handleCategoryError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw Object.assign(new Error("Category already exists"), { statusCode: 409 });
    }

    if (error.code === "P2025") {
      throw Object.assign(new Error("Category not found"), { statusCode: 404 });
    }
  }

  throw error;
}

export function listCategories(includeInactive = false) {
  return prisma.category.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: {
      name: "asc",
    },
  });
}

export async function createCategory(input: CreateCategoryInput) {
  try {
    return await prisma.category.create({
      data: {
        name: input.name.trim(),
        slug: normalizeCategorySlug(input)!,
        active: input.active ?? true,
      },
    });
  } catch (error) {
    handleCategoryError(error);
  }
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  try {
    return await prisma.category.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        slug: normalizeCategorySlug(input),
        active: input.active,
      },
    });
  } catch (error) {
    handleCategoryError(error);
  }
}

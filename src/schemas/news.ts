import { z } from "zod";

const uuidArraySchema = z.array(z.uuid()).default([]);
const tagNameArraySchema = z.array(z.string().trim().min(2).max(80)).default([]);

export const createNewsSchema = z.object({
  title: z.string().trim().min(3).max(180),
  slug: z.string().trim().min(3).max(220).optional(),
  summary: z.string().trim().min(10).max(320),
  content: z.string().trim().min(10),
  primaryCategoryId: z.uuid(),
  categoryIds: uuidArraySchema.optional(),
  tagIds: uuidArraySchema.optional(),
  tags: tagNameArraySchema.optional(),
  coverImageId: z.uuid().optional(),
  mediaIds: uuidArraySchema.optional(),
});

export const updateNewsSchema = z
  .object({
    title: z.string().trim().min(3).max(180).optional(),
    slug: z.string().trim().min(3).max(220).optional(),
    summary: z.string().trim().min(10).max(320).optional(),
    content: z.string().trim().min(10).optional(),
    primaryCategoryId: z.uuid().optional(),
    categoryIds: uuidArraySchema.optional(),
    tagIds: uuidArraySchema.optional(),
    tags: tagNameArraySchema.optional(),
    coverImageId: z.uuid().nullable().optional(),
    mediaIds: uuidArraySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const reviewCommentSchema = z.object({
  comment: z.string().trim().max(2000).optional(),
});

export const rejectNewsSchema = z.object({
  comment: z.string().trim().min(1).max(2000),
});

export const publicNewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  category: z.string().trim().min(1).max(100).optional(),
  tag: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

export const adminNewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(["DRAFT", "IN_REVIEW", "REJECTED", "APPROVED", "PUBLISHED", "ARCHIVED"]).optional(),
});

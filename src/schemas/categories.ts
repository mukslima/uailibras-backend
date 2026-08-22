import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(100).optional(),
  active: z.boolean().optional(),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    slug: z.string().trim().min(2).max(100).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

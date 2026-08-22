import { z } from "zod";

export const createTagSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(100).optional(),
});

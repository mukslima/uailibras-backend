import { z } from "zod";

export const uuidParamSchema = z.object({
  id: z.uuid(),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

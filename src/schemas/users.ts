import { z } from "zod";

export const userRoleSchema = z.enum(["ADMIN", "AUTHOR", "REVIEWER"]);

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[a-zA-Z0-9._-]+$/, "Username must contain only letters, numbers, dots, underscores, or hyphens");

export const passwordSchema = z.string().min(10).max(200);

export const createUserSchema = z.object({
  username: usernameSchema,
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  password: passwordSchema,
  role: userRoleSchema,
});

export const updateUserSchema = z
  .object({
    username: usernameSchema.optional(),
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(255).optional(),
    role: userRoleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "At least one field is required");

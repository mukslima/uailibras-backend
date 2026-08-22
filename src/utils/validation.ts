import { ZodError, type ZodSchema } from "zod";

export function parseBody<T>(schema: ZodSchema<T>, value: unknown) {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues.map((issue) => issue.message).join("; ");
      throw Object.assign(new Error(message), { statusCode: 400 });
    }

    throw error;
  }
}

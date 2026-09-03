import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { normalizeEmail, normalizeUsername } from "../utils/normalize";
import { hashPassword } from "../utils/password";

type CreateUserInput = {
  username: string;
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "AUTHOR" | "REVIEWER";
};

type UpdateUserInput = {
  username?: string;
  name?: string;
  email?: string;
  role?: "ADMIN" | "AUTHOR" | "REVIEWER";
  active?: boolean;
};

type ActingUser = {
  id: string;
};

const publicUserSelect = {
  id: true,
  username: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;

export function getPublicUserSelect() {
  return publicUserSelect;
}

function normalizeUserInput<T extends { username?: string; email?: string }>(input: T) {
  return {
    ...input,
    username: input.username ? normalizeUsername(input.username) : undefined,
    email: input.email ? normalizeEmail(input.email) : undefined,
  };
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toConflictError(error: unknown) {
  if (isUniqueConstraintError(error)) {
    throw Object.assign(new Error("Username or email already exists"), { statusCode: 409 });
  }

  throw error;
}

function forbidden(message: string) {
  return Object.assign(new Error(message), { statusCode: 403 });
}

function conflict(message: string) {
  return Object.assign(new Error(message), { statusCode: 409 });
}

function notFound() {
  return Object.assign(new Error("User not found"), { statusCode: 404 });
}

export async function createUser(input: CreateUserInput) {
  const normalized = normalizeUserInput(input);

  try {
    return await prisma.user.create({
      data: {
        username: normalized.username,
        name: input.name.trim(),
        email: normalized.email,
        passwordHash: await hashPassword(input.password),
        role: input.role,
      },
      select: publicUserSelect,
    });
  } catch (error) {
    toConflictError(error);
  }
}

export function listUsers() {
  return prisma.user.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: publicUserSelect,
  });
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: publicUserSelect,
  });

  if (!user) {
    throw notFound();
  }

  return user;
}

export async function updateUser(id: string, input: UpdateUserInput, actor: ActingUser) {
  const normalized = normalizeUserInput(input);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { id },
        select: {
          id: true,
          role: true,
          active: true,
        },
      });

      if (!existing) {
        throw notFound();
      }

      if (actor.id === id && input.role && input.role !== "ADMIN") {
        throw forbidden("Admins cannot change their own admin role");
      }

      if (actor.id === id && input.active === false) {
        throw forbidden("Admins cannot deactivate their own account");
      }

      const removesActiveAdmin =
        existing.role === "ADMIN" && existing.active && ((input.role && input.role !== "ADMIN") || input.active === false);

      if (removesActiveAdmin) {
        const activeAdminCount = await tx.user.count({
          where: {
            role: "ADMIN",
            active: true,
          },
        });

        if (activeAdminCount <= 1) {
          throw conflict("At least one active admin must remain");
        }
      }

      return tx.user.update({
        where: { id },
        data: {
          ...normalized,
          name: input.name?.trim(),
          role: input.role,
          active: input.active,
        },
        select: publicUserSelect,
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw notFound();
    }

    toConflictError(error);
  }
}

import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { normalizeEmail, normalizeUsername } from "../utils/normalize";
import { verifyPassword } from "../utils/password";
import {
  createRefreshToken,
  getRefreshTokenExpiresAt,
  hashRefreshToken,
  signAccessToken,
} from "../utils/token";
import { getPublicUserSelect } from "./users";

const invalidCredentialsError = () => Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
const loginUserSelect = {
  ...getPublicUserSelect(),
  passwordHash: true,
};

export async function login(app: FastifyInstance, identifier: string, password: string) {
  const normalizedIdentifier = identifier.includes("@")
    ? normalizeEmail(identifier)
    : normalizeUsername(identifier);

  const user = await prisma.user.findFirst({
    where: identifier.includes("@")
      ? { email: normalizedIdentifier }
      : { username: normalizedIdentifier },
    select: loginUserSelect,
  });

  if (!user || !user.active) {
    throw invalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(user.passwordHash, password);

  if (!passwordMatches) {
    throw invalidCredentialsError();
  }

  const refreshToken = createRefreshToken();

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashRefreshToken(refreshToken),
      userId: user.id,
      expiresAt: getRefreshTokenExpiresAt(),
    },
  });

  const accessToken = signAccessToken(app, {
    sub: user.id,
    role: user.role,
  });

  const safeUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: getPublicUserSelect(),
  });

  return {
    accessToken,
    refreshToken,
    user: safeUser,
  };
}

export async function refresh(app: FastifyInstance, refreshToken: string | undefined) {
  if (!refreshToken) {
    throw invalidCredentialsError();
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const storedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: true,
    },
  });

  if (
    !storedToken ||
    storedToken.revokedAt ||
    storedToken.expiresAt <= new Date() ||
    !storedToken.user.active
  ) {
    throw invalidCredentialsError();
  }

  const nextRefreshToken = createRefreshToken();

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        tokenHash: hashRefreshToken(nextRefreshToken),
        userId: storedToken.userId,
        expiresAt: getRefreshTokenExpiresAt(),
      },
    }),
  ]);

  const accessToken = signAccessToken(app, {
    sub: storedToken.user.id,
    role: storedToken.user.role,
  });

  const safeUser = await prisma.user.findUniqueOrThrow({
    where: { id: storedToken.user.id },
    select: getPublicUserSelect(),
  });

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    user: safeUser,
  };
}

export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) {
    return;
  }

  await prisma.refreshToken.updateMany({
    where: {
      tokenHash: hashRefreshToken(refreshToken),
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma";
import { getPublicUserSelect, type PublicUser } from "../services/users";
import type { AccessTokenPayload } from "../utils/token";

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: PublicUser;
  }
}

function unauthorized() {
  return Object.assign(new Error("Unauthorized"), { statusCode: 401 });
}

export async function requireAuth(request: FastifyRequest) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    throw unauthorized();
  }

  try {
    const token = authorization.slice("Bearer ".length);
    const payload = request.server.jwt.verify<AccessTokenPayload>(token);
    const user = await prisma.user.findUnique({
      where: {
        id: payload.sub,
        active: true,
      },
      select: getPublicUserSelect(),
    });

    if (!user) {
      throw unauthorized();
    }

    request.currentUser = user;
  } catch {
    throw unauthorized();
  }
}

export function requireRole(roles: Array<"ADMIN" | "AUTHOR" | "REVIEWER">) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    await requireAuth(request);

    if (!request.currentUser || !roles.includes(request.currentUser.role)) {
      throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    }
  };
}

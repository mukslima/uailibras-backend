import { Prisma } from "@prisma/client";

type ErrorLike = {
  name?: unknown;
  code?: unknown;
  originalCode?: unknown;
  kind?: unknown;
  cause?: unknown;
};

function asErrorLike(error: unknown): ErrorLike | null {
  return error && typeof error === "object" ? (error as ErrorLike) : null;
}

function hasPostgresSerializationCode(error: ErrorLike | null) {
  return error?.code === "40001" || error?.originalCode === "40001";
}

function hasTransactionWriteConflictKind(error: ErrorLike | null) {
  return error?.kind === "TransactionWriteConflict";
}

function isDriverAdapterError(error: ErrorLike | null) {
  return error?.name === "DriverAdapterError";
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function isRecordNotFoundError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export function isTransactionConflictError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return true;
  }

  const adapterError = asErrorLike(error);
  if (!isDriverAdapterError(adapterError)) {
    return false;
  }

  const cause = asErrorLike(adapterError?.cause);

  return (
    hasTransactionWriteConflictKind(cause) ||
    hasPostgresSerializationCode(cause)
  );
}

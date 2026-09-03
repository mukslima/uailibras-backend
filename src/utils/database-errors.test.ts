import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { isTransactionConflictError, isUniqueConstraintError } from "./database-errors";

test("database error helpers only recognize known conflict shapes", () => {
  assert.equal(isUniqueConstraintError(new Prisma.PrismaClientKnownRequestError("Unique", {
    clientVersion: "test",
    code: "P2002",
  })), true);

  assert.equal(isTransactionConflictError(new Prisma.PrismaClientKnownRequestError("Transaction conflict", {
    clientVersion: "test",
    code: "P2034",
  })), true);

  assert.equal(isTransactionConflictError({ name: "DriverAdapterError", cause: { kind: "TransactionWriteConflict" } }), true);
  assert.equal(isTransactionConflictError({ name: "DriverAdapterError", cause: { originalCode: "40001" } }), true);

  assert.equal(isTransactionConflictError(new Error("TransactionWriteConflict 40001")), false);
  assert.equal(isTransactionConflictError({ cause: { kind: "TransactionWriteConflict" } }), false);
  assert.equal(isTransactionConflictError({ originalCode: "40001" }), false);
  assert.equal(isTransactionConflictError({ code: "P2002" }), false);
  assert.equal(isTransactionConflictError({ name: "DriverAdapterError", cause: { originalCode: "23505" } }), false);
});

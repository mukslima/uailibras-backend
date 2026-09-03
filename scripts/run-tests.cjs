const { spawnSync } = require("node:child_process");
require("dotenv/config");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function parsePostgresUrl(name, value) {
  try {
    const url = new URL(value);

    if (!["postgres:", "postgresql:"].includes(url.protocol)) {
      throw new Error(`${name} must use postgresql:// or postgres://.`);
    }

    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

    if (!databaseName) {
      throw new Error(`${name} must include a database name.`);
    }

    return {
      host: url.hostname,
      port: url.port || "5432",
      databaseName,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid URL.";
    console.error(`${name} is invalid: ${detail}`);
    process.exit(1);
  }
}

if (!testDatabaseUrl) {
  console.error("TEST_DATABASE_URL is required for backend tests.");
  console.error("Use a dedicated test database. Refusing to run against DATABASE_URL.");
  process.exit(1);
}

const testDatabase = parsePostgresUrl("TEST_DATABASE_URL", testDatabaseUrl);

if (!testDatabase.databaseName.toLowerCase().includes("test")) {
  console.error("TEST_DATABASE_URL must point to a database whose name contains 'test'.");
  console.error(`Received database name: ${testDatabase.databaseName}`);
  process.exit(1);
}

if (process.env.DATABASE_URL && process.env.DATABASE_URL === testDatabaseUrl) {
  console.error("TEST_DATABASE_URL must be different from DATABASE_URL.");
  console.error("Refusing to run tests against the normal development database URL.");
  process.exit(1);
}

if (process.env.DATABASE_URL) {
  const developmentDatabase = parsePostgresUrl("DATABASE_URL", process.env.DATABASE_URL);
  const sameDatabase =
    developmentDatabase.host === testDatabase.host &&
    developmentDatabase.port === testDatabase.port &&
    developmentDatabase.databaseName === testDatabase.databaseName;

  if (sameDatabase) {
    console.error("TEST_DATABASE_URL must use a different PostgreSQL database from DATABASE_URL.");
    console.error("Changing only query params such as ?schema= does not isolate tests with the current runtime adapter.");
    console.error(`Both URLs resolve to ${testDatabase.host}:${testDatabase.port}/${testDatabase.databaseName}.`);
    process.exit(1);
  }
}

const patterns = process.argv.slice(2);
const testArgs = [
  "--require",
  "./scripts/tsx-windows-fix.cjs",
  "--import",
  "tsx",
  "--test",
  "--test-concurrency=1",
  ...(patterns.length > 0 ? patterns : ["src/**/*.test.ts"]),
];

const result = spawnSync(process.execPath, testArgs, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
  },
  stdio: "inherit",
});

process.exit(result.status ?? 1);

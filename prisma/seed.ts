import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { normalizeEmail, normalizeSlug, normalizeUsername } from "../src/utils/normalize";
import { hashPassword } from "../src/utils/password";

const requiredVariables = [
  "DATABASE_URL",
  "SEED_ADMIN_USERNAME",
  "SEED_ADMIN_NAME",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
] as const;

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(`${variable} is required for prisma seed`);
  }
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const username = normalizeUsername(process.env.SEED_ADMIN_USERNAME!);
  const email = normalizeEmail(process.env.SEED_ADMIN_EMAIL!);
  const initialCategories = ["Curso", "Audiência", "Evento", "Festival"];

  const existingAdmin = await prisma.user.findFirst({
    where: {
      role: "ADMIN",
      OR: [{ username }, { email }],
    },
  });

  if (existingAdmin) {
    console.log("Seed ADMIN already exists. Skipping creation.");
  } else {
    await prisma.user.create({
      data: {
        username,
        name: process.env.SEED_ADMIN_NAME!.trim(),
        email,
        passwordHash: await hashPassword(process.env.SEED_ADMIN_PASSWORD!),
        role: "ADMIN",
        active: true,
      },
    });

    console.log("Seed ADMIN created.");
  }

  for (const name of initialCategories) {
    await prisma.category.upsert({
      where: {
        slug: normalizeSlug(name),
      },
      update: {
        name,
        active: true,
      },
      create: {
        name,
        slug: normalizeSlug(name),
        active: true,
      },
    });
  }

  console.log("Initial categories ensured.");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });

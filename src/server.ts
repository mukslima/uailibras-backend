import { buildApp } from "./app";

const app = buildApp();
const port = Number(process.env.PORT) || 3333;
const host = process.env.HOST || "0.0.0.0";

async function start() {
  try {
    await app.listen({
      port,
      host,
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();

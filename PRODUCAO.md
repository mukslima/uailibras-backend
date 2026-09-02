# UaiLibras Backend - Producao

## Variaveis de ambiente

Use `.env.example` como referencia. Em producao, configure ao menos:

```text
NODE_ENV=production
PORT=3333
HOST=0.0.0.0
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=valor-longo-e-aleatorio
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGINS=https://uailibras.com.br,https://www.uailibras.com.br,https://painel.uailibras.com.br
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

`ADMIN_CORS_ORIGINS` continua aceito como alias de compatibilidade. Para deploys em dominios diferentes que exijam cookie cross-site, configure `REFRESH_TOKEN_COOKIE_SAMESITE=none` somente com HTTPS. `REFRESH_TOKEN_COOKIE_DOMAIN` deve ficar vazio, exceto se houver necessidade real de compartilhar cookie entre subdominios.

## Build e start

```bash
npm install
npm run prisma:generate
npm run build
npm start
```

O start de producao usa `node dist/server.js`; nao depende de `tsx` nem watcher.

## Migrations

Em producao, aplique migrations versionadas com:

```bash
npm run prisma:migrate:deploy
```

Nao use `prisma migrate dev` em producao. Nao resete banco nem apague volumes sem backup e decisao explicita.

## Banco de testes

Os testes do backend exigem `TEST_DATABASE_URL` e recusam rodar usando `DATABASE_URL`. Use um database PostgreSQL dedicado, nao apenas outro schema dentro do database de desenvolvimento.

Exemplo local:

```text
DATABASE_URL=postgresql://uailibras:uailibras_dev_password@localhost:5433/uailibras
TEST_DATABASE_URL=postgresql://uailibras:uailibras_dev_password@localhost:5433/uailibras_test
```

Crie o database de teste uma vez, sem recriar o volume e sem alterar o database `uailibras`:

```bash
docker exec uailibras-postgres createdb -U uailibras uailibras_test
```

Se o database ja existir, o comando pode retornar erro de duplicidade; isso nao exige apagar nada.

Antes da suite, aplique as migrations no database de teste:

```bash
DATABASE_URL=$TEST_DATABASE_URL npm run prisma:migrate:deploy
npm test
```

O runner valida as URLs antes de iniciar a suite: `TEST_DATABASE_URL` deve apontar para um database cujo nome contem `test` e nao pode resolver para o mesmo host, porta e database name de `DATABASE_URL`. Query params como `?schema=` nao contam como isolamento.

## Docker local

O `docker-compose.yml` local sobe apenas o PostgreSQL em `localhost:5433` e usa o volume persistente `postgres_data`. `docker compose down` preserva dados; comandos com remocao de volume apagam o banco local.

## Health check

```text
GET /health
```

Retorna somente estado operacional basico, sem detalhes sensiveis de infraestrutura.

## Ordem sugerida de deploy

1. Provisionar PostgreSQL.
2. Configurar env vars do backend.
3. Subir backend.
4. Executar `npm run prisma:migrate:deploy`.
5. Validar `/health` e API publica.
6. Configurar e subir admin com `NEXT_PUBLIC_API_URL`.
7. Configurar e subir frontend publico com `UAILIBRAS_API_URL`.
8. Apontar dominios/subdominios e validar login, noticias e paginas por slug.

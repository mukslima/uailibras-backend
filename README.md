# 🤟 UaiLibras — Backend

Backend do **UaiLibras**, plataforma voltada à divulgação de cursos, notícias, eventos e iniciativas relacionadas à **Libras, acessibilidade e comunidade surda**.

A API foi desenvolvida com **Node.js, Fastify e TypeScript**, utilizando **PostgreSQL + Prisma ORM** para persistência de dados.

O projeto possui autenticação, controle de acesso baseado em papéis (RBAC), gerenciamento de usuários, workflow editorial de notícias e armazenamento de imagens integrado ao Cloudinary.

---

## 🚀 Tecnologias

- **Node.js**
- **TypeScript**
- **Fastify**
- **PostgreSQL**
- **Prisma ORM**
- **Docker**
- **JWT**
- **Argon2id**
- **Zod**
- **Cloudinary**

---

## 🏗️ Arquitetura

O backend segue uma organização por responsabilidades, separando rotas, regras de negócio, validações, autenticação e acesso ao banco.

```text
src/
├── config/
├── plugins/
├── routes/
├── schemas/
├── services/
├── utils/
├── lib/
├── app.ts
└── server.ts

prisma/
├── migrations/
├── schema.prisma
└── seed.ts
```

Fluxo simplificado:

```text
Client
  ↓
Fastify Routes
  ↓
Validation / Authentication / RBAC
  ↓
Services
  ↓
Prisma ORM
  ↓
PostgreSQL
```

Para mídias:

```text
Media API
   ↓
StorageService
   ↓
Cloudinary
```

O PostgreSQL mantém os metadados da mídia, enquanto os arquivos são armazenados externamente.

---

## 🔐 Autenticação

A autenticação utiliza dois tipos de token:

### Access Token

JWT de curta duração utilizado para autenticar requisições protegidas.

```text
Default: 15 minutos
```

### Refresh Token

Token opaco e aleatório utilizado para renovar sessões.

O refresh token:

- não é JWT;
- é armazenado no banco apenas como hash SHA-256;
- possui expiração;
- pode ser revogado;
- utiliza rotação durante a renovação;
- é enviado através de cookie `HttpOnly`.

O cookie também utiliza:

```text
HttpOnly
SameSite=Lax
Secure em produção
```

As senhas são armazenadas utilizando **Argon2id**.

---

## 👥 Controle de acesso — RBAC

O sistema possui três papéis:

```text
ADMIN
AUTHOR
REVIEWER
```

### ADMIN

Responsável pela administração da plataforma.

Pode gerenciar usuários, conteúdo e recursos administrativos respeitando as regras do workflow editorial.

### AUTHOR

Responsável pela criação e edição de conteúdo.

Pode:

- criar notícias;
- editar suas próprias notícias;
- trabalhar com rascunhos;
- enviar conteúdo para revisão;
- realizar upload de imagens.

### REVIEWER

Responsável pelo processo editorial.

Pode:

- analisar notícias enviadas;
- aprovar conteúdo;
- rejeitar conteúdo;
- registrar comentários de revisão;
- publicar conteúdo aprovado.

O `REVIEWER` não edita diretamente o conteúdo do autor.

---

## 📰 Workflow Editorial

Notícias possuem um fluxo de publicação controlado pelo backend:

```text
DRAFT
   ↓
IN_REVIEW
   ├── REJECTED
   │      ↓
   │    DRAFT / nova revisão
   │
   └── APPROVED
          ↓
       PUBLISHED
          ↓
       ARCHIVED
```

As transições não podem ser realizadas alterando diretamente o campo `status`.

Cada ação possui regras próprias de autorização e endpoints específicos.

---

## 🛡️ Separação entre autoria e revisão

Uma regra importante do domínio editorial é:

> **Ninguém pode aprovar, rejeitar ou publicar a própria notícia.**

Essa regra também se aplica ao `ADMIN`.

Dessa forma, mesmo usuários administrativos precisam que outra pessoa participe do processo editorial antes da publicação.

Rejeições também exigem comentário do revisor.

O histórico das revisões é preservado para permitir múltiplos ciclos de correção e aprovação.

---

## 🏷️ Categorias e Tags

Uma notícia pode possuir múltiplas categorias.

Uma delas é definida como **categoria principal**, utilizada para destaque visual e classificação principal do conteúdo.

Categorias iniciais:

```text
Curso
Audiência
Evento
Festival
```

Também é possível associar múltiplas tags às notícias.

Categorias e tags utilizam slugs normalizados para facilitar consultas e integração com o frontend.

---

## 🖼️ Gerenciamento de Mídia

As imagens são armazenadas no **Cloudinary** através de uma abstração interna:

```text
StorageService
      ↓
CloudinaryStorageService
```

Isso evita acoplamento direto entre as regras de negócio e o provedor de armazenamento.

Os arquivos são organizados utilizando identificadores gerados pelo backend:

```text
uailibras/news/YYYY-MM-DD/uuid
```

O PostgreSQL mantém informações como:

```text
storageKey / publicId
secure URL
nome original
MIME type
tamanho
dimensões
usuário responsável
data de criação
```

---

## 🔒 Segurança de Upload

Uploads não confiam apenas na extensão ou no `Content-Type` enviado pelo cliente.

O backend verifica o tipo real do arquivo.

Atualmente são permitidos:

```text
image/jpeg
image/png
image/webp
```

Limite:

```text
10 MB
```

Arquivos como SVG, HTML e executáveis não são aceitos.

O conteúdo rich text das notícias também passa por sanitização antes de ser persistido.

---

## 🌐 API

A API utiliza versionamento:

```text
/api/v1
```

### Autenticação

```http
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

### Usuários

```http
POST  /api/v1/users
GET   /api/v1/users
GET   /api/v1/users/:id
PATCH /api/v1/users/:id
```

### Notícias públicas

```http
GET /api/v1/news
GET /api/v1/news/:slug
```

A API pública retorna somente conteúdo com status:

```text
PUBLISHED
```

### Administração de notícias

```http
POST  /api/v1/news
GET   /api/v1/admin/news
GET   /api/v1/admin/news/:id
PATCH /api/v1/news/:id

POST /api/v1/news/:id/submit
POST /api/v1/news/:id/reject
POST /api/v1/news/:id/approve
POST /api/v1/news/:id/publish
POST /api/v1/news/:id/archive
```

### Categorias

```http
GET   /api/v1/categories
POST  /api/v1/categories
PATCH /api/v1/categories/:id
```

### Tags

```http
GET  /api/v1/tags
POST /api/v1/tags
```

### Mídia

```http
POST   /api/v1/media
DELETE /api/v1/media/:id
```

---

## 🗄️ Banco de Dados

O projeto utiliza **PostgreSQL** com **Prisma ORM**.

O ambiente local pode ser executado através de Docker.

Entre as principais entidades estão:

```text
User
RefreshToken

News
NewsReview

Category
Tag

Media

NewsCategory
NewsTag
NewsMedia
```

As alterações de estrutura do banco são controladas através de **Prisma Migrations**.

---

## 🌱 Seed

O projeto possui seed idempotente para criação do primeiro administrador e dados iniciais.

As credenciais do administrador são fornecidas exclusivamente através de variáveis de ambiente.

```env
SEED_ADMIN_USERNAME=
SEED_ADMIN_NAME=
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
```

O seed também garante as categorias editoriais iniciais.

```bash
npx prisma db seed
```

Executá-lo novamente não deve duplicar os registros existentes.

---

## ⚙️ Variáveis de Ambiente

Crie um arquivo `.env` baseado no `.env.example`.

Exemplo:

```env
DATABASE_URL=""

JWT_ACCESS_SECRET=""
JWT_ACCESS_EXPIRES_IN="15m"

JWT_REFRESH_EXPIRES_IN="7d"

SEED_ADMIN_USERNAME=""
SEED_ADMIN_NAME=""
SEED_ADMIN_EMAIL=""
SEED_ADMIN_PASSWORD=""

CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""
```

> Nunca versione credenciais reais ou secrets.

---

## 🐳 PostgreSQL com Docker

Suba o ambiente local:

```bash
docker compose up -d
```

Confira os containers:

```bash
docker compose ps
```

Para interromper:

```bash
docker compose stop
```

Os dados permanecem persistidos através do volume configurado no Docker.

---

## 💻 Executando Localmente

Clone o repositório:

```bash
git clone https://github.com/mukslima/uailibras-backend.git
cd uailibras-backend
```

Instale as dependências:

```bash
npm install
```

Configure:

```text
.env
```

Gere o Prisma Client:

```bash
npx prisma generate
```

Aplique as migrations:

```bash
npx prisma migrate deploy
```

Execute o seed:

```bash
npx prisma db seed
```

Inicie o projeto conforme os scripts disponíveis no `package.json`.

---

## ❤️ Health Check

A API possui endpoint para verificação básica da aplicação:

```http
GET /health
```

Resposta esperada:

```json
{
  "status": "ok"
}
```

---

## 🧪 Testes e Qualidade

O projeto possui testes automatizados cobrindo áreas como:

- autenticação;
- login;
- refresh token;
- logout;
- RBAC;
- gerenciamento de usuários;
- workflow editorial;
- regras de autoria/revisão;
- categorias;
- tags;
- visibilidade pública;
- validação de uploads;
- integração da camada de storage através de fake/mock.

Execute:

```bash
npm test
```

Typecheck:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

Validação do Prisma:

```bash
npx prisma validate
```

---

## ☁️ Cloudinary

A integração com Cloudinary ocorre exclusivamente no backend.

Credenciais nunca são enviadas ao frontend.

O fluxo é:

```text
Frontend
   ↓
UaiLibras API
   ↓
Validação do arquivo
   ↓
StorageService
   ↓
Cloudinary
   ↓
PostgreSQL (metadados)
```

Os testes automatizados utilizam uma implementação fake do storage e não dependem de credenciais externas.

A integração real também foi validada com upload, consulta da URL pública e exclusão controlada do recurso.

---

## 📦 Frontend

O frontend é mantido separadamente:

```text
uailibras-frontend
```

Stack:

```text
Next.js
React
TypeScript
```

A comunicação entre os projetos será realizada através da API REST.

---

## 🗺️ Roadmap

### ✅ Concluído

- [x] Estrutura base com Fastify + TypeScript
- [x] PostgreSQL
- [x] Prisma ORM
- [x] Docker para desenvolvimento local
- [x] Migrations
- [x] Seed
- [x] Autenticação
- [x] Access Token
- [x] Refresh Token com rotação
- [x] Argon2id
- [x] RBAC
- [x] Gerenciamento de usuários
- [x] Domínio editorial
- [x] Workflow de revisão
- [x] Categorias e tags
- [x] Upload seguro de imagens
- [x] Cloudinary
- [x] Testes automatizados

### 🚧 Próximas etapas

- [ ] Integração com painel administrativo
- [ ] Integração completa com frontend público
- [ ] Testes end-to-end
- [ ] Hardening de segurança
- [ ] Tratamento final de erros
- [ ] Configuração de produção
- [ ] Deploy do backend
- [ ] Documentação da API

---

## 👨‍💻 Autor

Desenvolvido e mantido por **Marcos AND Lima**.

GitHub: **@mukslima**

---

## 🤟 UaiLibras

**Comunicar, Aprender & Incluir.**

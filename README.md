# 🤟 UaiLibras — Backend

Backend do **UaiLibras**, plataforma voltada à divulgação de cursos, notícias, eventos e iniciativas relacionadas à **Libras, acessibilidade e comunidade surda**.

A API foi desenvolvida com **Node.js, Fastify e TypeScript**, utilizando **PostgreSQL e Prisma ORM** para persistência de dados.

O projeto foi estruturado para atender autenticação, gerenciamento de usuários, controle de acesso, workflow editorial e gerenciamento de mídia.

## 🚀 Tecnologias

- Node.js
- TypeScript
- Fastify
- PostgreSQL
- Prisma ORM
- Docker
- JWT
- Argon2id
- Zod
- Cloudinary

## 🏗️ Arquitetura

O backend utiliza separação de responsabilidades entre rotas, validações, regras de negócio, autenticação e persistência.

```text
Client
  ↓
Fastify
  ↓
Validation / Authentication / Authorization
  ↓
Services
  ↓
Prisma ORM
  ↓
PostgreSQL
```

O gerenciamento de arquivos utiliza uma camada de abstração de storage, mantendo as regras de negócio desacopladas do provedor externo.

## 🔐 Autenticação e Segurança

A API possui uma camada própria de autenticação e autorização.

Entre os recursos implementados estão:

- autenticação baseada em tokens;
- renovação segura de sessão;
- armazenamento seguro de senhas com Argon2id;
- controle de acesso baseado em papéis (RBAC);
- validação de dados de entrada;
- sanitização de conteúdo;
- proteção das rotas administrativas;
- validação segura de uploads.

Credenciais e informações sensíveis são configuradas exclusivamente através de variáveis de ambiente.

## 👥 Controle de Acesso

O sistema trabalha com diferentes níveis de acesso:

- **Administrador**
- **Autor**
- **Revisor**

As permissões são validadas no backend e utilizadas para separar responsabilidades administrativas e editoriais.

## 📰 Workflow Editorial

O backend possui um domínio editorial para gerenciamento do ciclo de vida das notícias.

```text
Criação
   ↓
Rascunho
   ↓
Revisão
   ↓
Aprovação / Correção
   ↓
Publicação
```

O workflow mantém separação entre autoria e revisão, histórico editorial e controle das transições de estado.

Além das notícias, o domínio suporta:

- múltiplas categorias;
- categoria principal;
- tags;
- histórico de revisão;
- gerenciamento de mídia;
- arquivamento de conteúdo.

## 🖼️ Gerenciamento de Mídia

As imagens são armazenadas utilizando **Cloudinary**, enquanto seus metadados permanecem associados ao conteúdo no PostgreSQL.

A integração é realizada através de uma abstração própria de storage:

```text
Media Service
     ↓
Storage Abstraction
     ↓
Cloudinary
```

Essa abordagem reduz o acoplamento da aplicação ao provedor externo.

O upload também possui validações de formato, tamanho e conteúdo antes do armazenamento.

## 🗄️ Banco de Dados

O projeto utiliza **PostgreSQL** com **Prisma ORM**.

O desenvolvimento local utiliza PostgreSQL através de Docker, com volume persistente para preservar os dados entre execuções.

A evolução do banco é controlada através de migrations versionadas.

## 🐳 Ambiente de Desenvolvimento

Suba o PostgreSQL:

```bash
docker compose up -d
```

Instale as dependências:

```bash
npm install
```

Configure o ambiente utilizando:

```text
.env.example
```

Gere o Prisma Client:

```bash
npx prisma generate
```

Aplique as migrations:

```bash
npx prisma migrate deploy
```

Inicie a aplicação:

```bash
npm run dev
```

## ❤️ Health Check

A API possui um endpoint de health check para validação básica da aplicação.

```text
GET /health
```

## 🧪 Testes e Qualidade

O projeto possui testes automatizados para as principais regras da aplicação, incluindo:

- autenticação;
- autorização e RBAC;
- gerenciamento de usuários;
- workflow editorial;
- regras de autoria e revisão;
- categorias e tags;
- visibilidade de conteúdo;
- validação de uploads;
- camada de armazenamento.

Comandos principais:

```bash
npm test
npm run typecheck
npm run build
npx prisma validate
```

## ☁️ Serviços Externos

O projeto utiliza **Cloudinary** para armazenamento e entrega de imagens.

A integração ocorre exclusivamente através do backend, sem exposição de credenciais ao cliente.

Os testes automatizados utilizam abstrações locais/fakes para evitar dependência de serviços externos durante a execução da suíte.

## 🔗 Frontend

O frontend do UaiLibras é mantido em um repositório independente e desenvolvido com:

- Next.js
- React
- TypeScript

A comunicação entre frontend e backend é realizada através de uma API REST.

## 🗺️ Roadmap

### ✅ Implementado

- [x] Estrutura base da API
- [x] PostgreSQL + Prisma ORM
- [x] Ambiente Docker
- [x] Migrations e seed
- [x] Autenticação
- [x] Controle de acesso (RBAC)
- [x] Gerenciamento de usuários
- [x] Workflow editorial
- [x] Categorias e tags
- [x] Gerenciamento de imagens
- [x] Integração com Cloudinary
- [x] Testes automatizados

### 🚧 Próximas etapas

- [ ] Integração com painel administrativo
- [ ] Integração com frontend público
- [ ] Testes end-to-end
- [ ] Hardening de segurança
- [ ] Configuração de produção
- [ ] Deploy do backend
- [ ] Documentação da API

## 👨‍💻 Desenvolvimento

Desenvolvido e mantido por **Marcos AND Lima**.

GitHub: **@mukslima**

---

## 🤟 UaiLibras

**Comunicar, Aprender & Incluir.**

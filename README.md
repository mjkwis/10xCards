# 10xCards

10xCards is an AI-assisted flashcard application for IT professionals who want
to retain knowledge discovered while reading technical documentation, articles,
and forum answers. A user can paste source text, review flashcards proposed by
AI, and save only the useful cards to a private collection.

The product is designed to reduce the effort between finding useful information
and turning it into material for later study. Its requirements and scope are
defined in the [Product Requirements Document](./context/foundation/prd.md).

## Current MVP scope

The repository currently implements:

- email and password registration, sign-in, and sign-out with Supabase Auth;
- authenticated access to a private flashcard collection;
- AI generation of up to 10 flashcard candidates from pasted text of up to
  5,000 characters;
- review of generated candidates before persistence: accept, edit, or reject;
- manual creation and listing of flashcards;
- editing persisted flashcards;
- deletion of flashcards after explicit confirmation;
- owner-scoped PostgreSQL Row Level Security policies for every flashcard
  operation.

An SRS-based study session is specified in the PRD and is currently being
planned. It is not implemented in the current codebase. See the
[project roadmap](./context/foundation/roadmap.md) for delivery status.

## Core workflow

1. A user creates an account or signs in.
2. The user pastes a fragment of source material into the dashboard.
3. OpenRouter generates question-and-answer candidates based only on that text.
4. The user accepts, edits, or rejects each candidate.
5. Accepted cards are saved to the user's private Supabase collection.
6. The user can also create, browse, edit, and delete cards manually.

AI-generated cards are stored with their origin. A candidate accepted without
changes uses the `ai-full` source, an edited candidate uses `ai-edited`, and a
manually created card uses `manual`.

## Tech stack

- [Astro 6](https://astro.build/) with server-side rendering
- [React 19](https://react.dev/) islands for interactive workflows
- [TypeScript 5](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) for PostgreSQL and authentication
- [OpenRouter](https://openrouter.ai/) for structured AI generation
- [Zod](https://zod.dev/) for request and response validation
- [Cloudflare Workers](https://workers.cloudflare.com/) as the runtime target

## Architecture

```text
src/
|-- components/
|   |-- auth/                  # Registration and sign-in forms
|   `-- flashcards/           # Generation, review, and CRUD interfaces
|-- lib/
|   |-- services/openrouter.ts # AI request and response processing
|   |-- flashcards.ts          # Client-side flashcard API functions
|   `-- supabase.ts            # Cookie-aware Supabase server client
|-- pages/
|   |-- api/auth/              # Authentication endpoints
|   |-- api/flashcards/        # Generation and CRUD endpoints
|   |-- auth/                  # Authentication pages
|   `-- dashboard.astro        # Protected application screen
`-- middleware.ts              # Session resolution and route protection

supabase/migrations/           # Database schema and RLS policies
context/foundation/            # PRD, roadmap, and technical decisions
```

Astro API routes provide the server boundary. Supabase persists flashcards and
enforces ownership in the database. React islands call the API routes and keep
the dashboard state synchronized after create, update, and delete operations.

## Prerequisites

- Node.js 22 (the project version is recorded in `.nvmrc`)
- npm
- Docker, when running Supabase locally
- an OpenRouter API key to use AI generation

## Local setup

1. Clone the repository and install dependencies:

```bash
git clone https://github.com/mjkwis/10xCards.git
cd 10xCards
npm install
```

2. Start the local Supabase stack:

```bash
npx supabase start
```

The command prints a local API URL and anon key. The existing migration creates
the `flashcards` table, validation constraints, update trigger, index, and
owner-scoped RLS policies.

3. Create a `.dev.vars` file in the project root:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<local-anon-key>
OPENROUTER_API_KEY=<openrouter-api-key>
# Optional; defaults to openai/gpt-4o-mini
OPENROUTER_MODEL=openai/gpt-4o-mini
```

`.dev.vars` is ignored by Git. These variables are declared as server-only
secrets in `astro.config.mjs` and are not exposed to browser code.

4. Start the development server:

```bash
npm run dev
```

Astro serves the application at `http://localhost:4321` by default.

To stop the local Supabase services, run:

```bash
npx supabase stop
```

## Hosted Supabase

To use a hosted Supabase project, link the local Supabase configuration and push
the migration:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Set `SUPABASE_URL` to the hosted project URL and `SUPABASE_KEY` to its anon key
in `.dev.vars`. The current registration flow expects email confirmation to be
disabled when immediate access after sign-up is required. Configure this under
Authentication settings in the Supabase dashboard.

## Application routes

| Route          | Purpose                                                           |
| -------------- | ----------------------------------------------------------------- |
| `/`            | Redirects to the dashboard or sign-in page based on session state |
| `/auth/signup` | Creates an account with email and password                        |
| `/auth/signin` | Starts an authenticated session                                   |
| `/dashboard`   | Displays AI generation, manual creation, and the user's cards     |

The dashboard and all flashcard API endpoints require an authenticated user.

## API routes

| Method and route                | Purpose                                        |
| ------------------------------- | ---------------------------------------------- |
| `POST /api/auth/signup`         | Register a user                                |
| `POST /api/auth/signin`         | Sign in a user                                 |
| `POST /api/auth/signout`        | Sign out the current user                      |
| `GET /api/flashcards`           | List the current user's flashcards             |
| `POST /api/flashcards`          | Persist a manual or accepted AI flashcard      |
| `PATCH /api/flashcards/:id`     | Update a persisted flashcard                   |
| `DELETE /api/flashcards/:id`    | Delete a persisted flashcard                   |
| `POST /api/flashcards/generate` | Generate flashcard candidates from source text |

## Available scripts

| Command            | Purpose                                                  |
| ------------------ | -------------------------------------------------------- |
| `npm run dev`      | Start the Cloudflare-compatible Astro development server |
| `npm run build`    | Create a production build                                |
| `npm run preview`  | Preview the production build locally                     |
| `npm run lint`     | Run ESLint with type-aware rules                         |
| `npm run lint:fix` | Apply supported ESLint fixes                             |
| `npm run format`   | Format the repository with Prettier                      |
| `npm run deploy`   | Build and deploy with Wrangler                           |

## Data ownership and privacy

Every flashcard row stores the authenticated Supabase user's ID. Select, insert,
update, and delete policies require `auth.uid() = user_id`, so ownership is
enforced even if an API query is changed incorrectly. API handlers also reject
unauthenticated requests and scope mutations to the current user.

Source text is sent to OpenRouter only when the authenticated user explicitly
requests generation. The request asks OpenRouter to use a zero-data-retention
provider. Generated candidates are validated before they are returned, and no
source text is stored in the `flashcards` table.

## Product documentation

- [Product requirements](./context/foundation/prd.md)
- [Roadmap](./context/foundation/roadmap.md)
- [Shape notes](./context/foundation/shape-notes.md)
- [Technical stack decision](./context/foundation/tech-stack.md)
- [Infrastructure notes](./context/foundation/infrastructure.md)

## Current limitations

- The SRS study session from FR-009 is not implemented yet.
- Source material is accepted as pasted text only; document import is out of
  scope for the MVP.
- Flashcard deduplication and collection sharing are intentionally out of scope.
- An automated test suite and risk-based test plan have not been added yet.

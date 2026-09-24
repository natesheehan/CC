# Contributing to Concept Cartography

Concept Cartography (CC) is a SvelteKit application for collaborative concept mapping. Contributions to application code, database queries, tests, documentation, accessibility, and visual design are welcome.

This guide describes the project's technical shape, a disciplined local workflow, and the standards expected for changes that are ready to review.

## Project architecture

CC is built with Svelte 5 and SvelteKit. The application is deployed with the Vercel adapter and uses libSQL through Drizzle ORM. Local development uses a SQLite file; production uses Turso or another compatible hosted libSQL database.

The source tree is organized by responsibility:

- `src/routes` contains pages, server loads, form actions, and HTTP endpoints.
- `src/lib/components` contains reusable Svelte UI components.
- `src/lib/server` contains database access, authentication, activity logging, and rate limiting. Server-only code must remain here.
- `src/lib/shared` contains browser-safe types, relation metadata, and formatting helpers shared by server and client code.
- `src/lib/content/docs` contains the Markdown source for documentation pages.
- `tests` contains Vitest and Testing Library coverage for behavior that is easy to regress.

The database schema is defined in `src/lib/server/db/schema.ts`. Queries should be added to `src/lib/server/queries.ts` when they are shared by more than one route. Mutations should validate the current session and enforce authorization on the server; hiding a button is not an authorization boundary.

## Local development

Use a supported Node.js version for the project tooling, then install dependencies:

```bash
npm install
npm run dev
```

Without database environment variables, the app uses a local database at `./data/conceptmap.db`. For a hosted database, configure the URL and token in the environment rather than committing secrets:

```bash
DATABASE_URL="libsql://your-database.turso.io" \\
DATABASE_AUTH_TOKEN="your-token" \\
npm run dev
```

Never commit `.env` files, database files, authentication tokens, or generated build output.

## Choose and scope a change

Before implementing a substantial feature, open an issue or describe the proposal in a draft pull request. State the user problem, the intended behavior, the affected routes or data model, and any migration or deployment implications.

Prefer a small, coherent change over a broad refactor. A useful contribution should have one clear purpose, preserve existing behavior outside that purpose, and include the minimum supporting documentation and tests.

## Branch and commit workflow

Create a topic branch from the current default branch:

```bash
git switch main
git pull --ff-only
git switch -c improve-concept-directory
```

Keep commits focused and descriptive. Do not commit generated directories such as `.svelte-kit`, `.vercel`, `node_modules`, or local database files. Review the final diff before opening a pull request:

```bash
git status --short
git diff --check
git diff --stat
```

## Implementation standards

Follow the existing Svelte 5 runes patterns and preserve established component APIs unless a public contract must change. Keep authorization, validation, and destructive operations on the server. Use Drizzle's structured query API rather than constructing SQL with string concatenation.

For database changes:

1. Update `schema.ts` and any production migration required by the change.
2. Consider existing data, foreign keys, cascade behavior, and rollback implications.
3. Test the migration against a copy or disposable database before deployment.
4. Document new environment variables or operational steps.

For UI changes:

- Make keyboard interaction and focus states usable.
- Keep text readable in both light and dark themes.
- Check mobile and desktop layouts.
- Prefer semantic elements and accessible names over visual labels alone.
- Add screenshots or a short recording when the change is primarily visual.

## Verification

Run the type checker and tests before requesting review:

```bash
npm run check
npm test
```

For a production-like verification, also run:

```bash
npm run build
```

The test suite may expose an unrelated existing failure. Do not conceal it by weakening an assertion or changing unrelated behavior; report the failure, its reproduction command, and whether your change affects it.

## Pull requests

A pull request should explain:

- The problem and user-visible behavior addressed.
- The implementation approach and important tradeoffs.
- Tests and commands run, including any known failures.
- Database migrations, environment variables, or deployment steps.
- Accessibility and responsive UI considerations for interface changes.

Keep the pull request reviewable. Split unrelated fixes into separate pull requests, respond to review comments with concrete changes or a reasoned explanation, and update documentation when behavior or setup changes.

## Open-source conduct

Be precise, respectful, and generous in technical discussion. Credit prior work. Ask questions before assuming intent. A good review identifies a risk or gap, explains why it matters, and suggests a path toward improvement. Documentation, tests, issue triage, design feedback, and examples are all meaningful contributions.

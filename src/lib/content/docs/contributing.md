# How to contribute to Concept Cartography

Concept Cartography is an open software project for collaborative knowledge mapping. Contributions to the code, documentation, tests, and design are welcome. You do not need to have the whole system understood before helping: a focused improvement with a clear explanation is useful.

## Set up the project

The app uses Svelte 5, SvelteKit, TypeScript, Tailwind CSS, Drizzle ORM, and libSQL. For local development:

```bash
npm install
npm run dev
```

With no database environment variables, local development uses `./data/conceptmap.db`. Production uses a hosted Turso/libSQL database through `DATABASE_URL` and `DATABASE_AUTH_TOKEN`.

## Choose a useful change

Good starting points include improving the graph editor, making the dictionary and docs clearer, adding focused tests, improving accessibility, or fixing a small workflow that feels awkward. Before starting a larger change, open an issue or describe the proposed direction in a pull request so the work stays coordinated.

## Work locally

Create a branch for your change, keep commits focused, and follow the patterns already used in the codebase. Server-side database access belongs in `src/lib/server`, shared client types and relation metadata belong in `src/lib/shared`, and route-specific UI belongs beside its route.

Run the checks before opening a pull request:

```bash
npm run check
npm test
```

If a test exposes an unrelated existing failure, call that out clearly rather than changing unrelated behavior. Include screenshots for meaningful UI changes and explain any database migration requirements.

## Open a pull request

Describe what changed, why it changed, and how you verified it. Keep the pull request small enough to review. Mention accessibility considerations, responsive behavior, and any environment variables or deployment steps a maintainer needs to know about.

## Keep the project welcoming

Be specific and generous in code review. Discuss tradeoffs in the open, credit prior work, and assume that contributors are trying to improve the shared tool. Documentation and examples are contributions too.

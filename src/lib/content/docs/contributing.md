# Contributing to Concept Cartography

Concept Cartography (CC) is an open, collaborative concept-mapping application. It is developed in the open at [github.com/natesheehan/CC](https://github.com/natesheehan/CC), and contributions of every kind are welcome: application code, database and query work, tests, documentation, accessibility, visual design, bug reports, and thoughtful review of other people's changes.

This guide explains how the project is built, how to set up a working development environment, and the process a change follows from idea to deployment. It is written for people contributing to the software itself. If you want to contribute to the content of a map, see the Governance guide instead.

## Ways to contribute

You do not need to write code to make a meaningful contribution. Useful work includes:

- **Reporting bugs** with clear reproduction steps, the browser and device used, and what you expected to happen.
- **Proposing features** by describing the problem a user faces before describing a solution.
- **Improving documentation**, including these guides, the README, and inline comments that explain non-obvious decisions.
- **Writing tests** for behaviour that is easy to break, particularly in the graph canvas and the form modals.
- **Auditing accessibility**, such as keyboard navigation, focus management, colour contrast, and screen-reader labels.
- **Reviewing pull requests** by testing a branch locally and reporting what you found.
- **Triaging issues** by confirming reports, finding duplicates, and narrowing down causes.

## How the project is built

CC is a single SvelteKit application. The main technologies are:

- **Svelte 5 and SvelteKit 2**, using runes (`$state`, `$derived`, `$effect`, `$props`) for component state.
- **Drizzle ORM over libSQL.** The same client connects to a local SQLite file in development and a hosted Turso database in production, so there is no separate production code path.
- **d3-force** for the force-directed network layout, rendered as plain SVG.
- **Tailwind CSS** for styling, with shared component classes (prefixed `cc-`) defined in `src/app.css`.
- **marked** for rendering the Markdown documentation pages.
- **Vitest, jsdom, and Testing Library** for component tests.
- **The Vercel adapter** for deployment as serverless functions.

### Source layout

The codebase is organised by responsibility. Respecting these boundaries is the most important convention in the project.

- `src/routes` holds pages (`+page.svelte`), server loads and form actions (`+page.server.ts`), and JSON endpoints (`+server.ts`). Map editing is handled by REST-style endpoints under `src/routes/maps/[id]/`, for concepts, relations, relation types, and relation comments.
- `src/lib/components` holds reusable Svelte components, such as `GraphCanvas`, `ConceptPanel`, the form modals, and `ActivityFeed`.
- `src/lib/server` holds everything that must never reach the browser: the database client and schema (`db/`), authentication and sessions (`auth.ts`), the activity log (`activity.ts`), shared read queries (`queries.ts`), and rate limiting (`rateLimit.ts`). SvelteKit prevents this directory from being imported by client code.
- `src/lib/shared` holds browser-safe code used on both sides: client-facing types (`types.ts`), the built-in relation types and their labels, colours, and directionality (`relations.ts`), and formatting helpers (`format.ts`).
- `src/lib/content/docs` holds the Markdown source for the documentation pages, including this one.
- `scripts` holds one-off operational scripts, such as migrations for existing production databases.
- `tests` holds the Vitest suite and its setup file.

### Request lifecycle

Every request passes through `src/hooks.server.ts`, which does two things:

1. It calls `ensureSchema()`, which creates any missing tables and indexes. This runs once per server instance and is cached afterwards.
2. It resolves the session cookie into `event.locals.user`, which is either the signed-in user or `null`.

Routes and endpoints then read `locals.user` to decide what the requester may do. Nothing else in the application needs to know how sign-in works, so `auth.ts` is the only file that would change if the project moved to a different authentication scheme.

### Core concepts in the data model

The schema lives in `src/lib/server/db/schema.ts`. Its main tables are:

- **users** and **sessions**: named sign-in with no passwords. A cookie holds a session ID that lasts 30 days.
- **maps**: a named collection of concepts, owned by the user who created it.
- **concepts**: graph nodes with a name, definition, sources, example, quiz question, and a saved `x`/`y` position so that the layout stays stable between visits.
- **concept_relations**: typed edges between two concepts in the same map, with a `direction` of `forward` or `both`.
- **relation_types**: custom relation types defined per map, alongside the eight built-in types in `src/lib/shared/relations.ts`.
- **relation_comments**: a flat discussion thread attached to a relation.
- **activity_log**: an append-only audit trail that records who changed what.
- **rate_limits**: fixed-window counters that are stored in the database, because in-memory counters do not work across serverless instances.

## Setting up a development environment

### Prerequisites

- Node.js 20 LTS or newer, with npm.
- Git.
- A GitHub account, if you intend to open a pull request.

You do not need a Turso account to develop locally.

### Install and run

Fork the repository on GitHub, then clone your fork and install dependencies:

```bash
git clone https://github.com/<your-username>/CC.git
cd CC
npm install
npm run dev
```

Open the local URL that the dev server prints, which is usually `http://localhost:5173`. The dev server listens on all network interfaces, so you can also open the app from a phone on the same network to check mobile layouts.

When no database environment variables are set, the app creates and migrates a local SQLite database at `./data/conceptmap.db` the first time it handles a request. To start from a clean slate, stop the dev server and delete that file.

### Useful commands

```bash
npm run dev         # start the Vite dev server with hot reloading
npm run check       # sync SvelteKit types and run svelte-check
npm test            # run the Vitest suite once
npm run build       # produce a production build
npm run preview     # serve the production build locally
npm run db:studio   # browse the database in Drizzle Studio
```

### Connecting to a hosted database

To reproduce a problem that only happens in production, you can point your local server at a disposable Turso database. Pass the credentials in the environment, and never commit them:

```bash
DATABASE_URL="libsql://your-database.turso.io" \
DATABASE_AUTH_TOKEN="your-token" \
npm run dev
```

The app also accepts `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, which are the names Vercel's Turso integration uses. Do not develop against the live production database.

## The contribution workflow

### 1. Start with an issue

For anything larger than a typo or an obvious small bug fix, open an issue (or comment on an existing one) before you start writing code. Describe:

- the problem, from the point of view of the person using CC;
- the behaviour you propose;
- the routes, components, or tables likely to be affected;
- any migration, deployment, or data-compatibility concerns.

This gives maintainers a chance to point out existing work, constraints, or simpler approaches before you invest time. If you plan to work on an issue, say so in a comment so that effort is not duplicated.

### 2. Create a branch

Keep your fork's `main` in sync with the upstream repository, and create a short, descriptive topic branch for each change:

```bash
git remote add upstream https://github.com/natesheehan/CC.git
git switch main
git pull --ff-only upstream main
git switch -c fix/relation-arrow-direction
```

Prefixes such as `fix/`, `feat/`, `docs/`, `test/`, and `refactor/` help reviewers see the intent of a branch at a glance.

### 3. Make focused commits

Each commit should represent one logical step and leave the project in a working state. Write commit messages in the imperative mood, with a concise subject line of 72 characters or fewer, followed by a body that explains why the change was made when the reason is not obvious:

```text
Persist relation direction when changing its type

Changing a relation's type previously reset its direction to the type's
default, discarding an explicit "both" setting. Only apply the default
when the relation is first created.
```

Never commit `.env` files, database files in `data/`, authentication tokens, or generated directories such as `node_modules`, `.svelte-kit`, and `.vercel`. The `.gitignore` covers these, but review what you stage.

### 4. Verify your change

Before you ask for review, run:

```bash
npm run check
npm test
npm run build
```

All three should pass. Then test the change by hand in the browser, including the unhappy paths: signed out, invalid input, and deleted or missing records. If the suite has a failure that existed before your change, do not weaken or skip the test. Mention it in your pull request with the command that reproduces it, and say whether your change affects it.

Finally, review your own diff:

```bash
git status --short
git diff --check
git diff --stat main
```

### 5. Open a pull request

Push your branch to your fork and open a pull request against `main`. A good description covers:

- **What and why**: the problem and the behaviour a user will notice.
- **How**: the approach you took, and any alternatives you rejected.
- **Verification**: the commands you ran and the manual checks you made, including known failures.
- **Operations**: any schema changes, migration scripts, new environment variables, or deployment steps.
- **Interface**: screenshots or a short recording for visual changes, and notes on keyboard, screen-reader, dark-mode, and mobile behaviour.

Link the related issue (for example, `Closes #42`). Open the pull request as a draft if you want early feedback on the direction.

### 6. Review and merge

A maintainer will review your pull request. Expect questions and requests for changes; they are part of the normal process and are not a judgement on your work. Respond by pushing new commits or by explaining your reasoning, and resolve conversations as you address them.

Once approved, a maintainer merges the pull request. Merging to `main` triggers a Vercel production deployment, so a pull request must not be merged while it depends on a database migration that has not yet been applied, or on an environment variable that has not been configured.

## Engineering standards

### Server code and authorization

Every mutating endpoint follows the same shape. Keep to it when you add a new one:

```ts
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);

	// 1. Load the record, scoped to the map in the URL; return 404 if absent.
	// 2. Validate and normalise the request body; return 400 on bad input.
	// 3. Check ownership where the action is restricted; return 403 otherwise.
	// 4. Write the change and bump maps.updatedAt.
	// 5. Record it with logActivity().
	// 6. Return JSON with dates serialised as ISO strings.
};
```

In particular:

- **Authorization belongs on the server.** Hiding a button in the interface is not access control. For example, only a map's creator may delete it, and the endpoint enforces this with a 403 response.
- **Always scope lookups by map.** Query records by both their own ID and `mapId`, so a request cannot reach a concept or relation that belongs to a different map.
- **Log every content change.** Creating, editing, or deleting a map, concept, relation, relation type, or comment must call `logActivity()` with a clear, human-readable summary. Repositioning a node is deliberately not recorded as a content edit.
- **Rate-limit writes.** Call `rateLimitUserWrite()` in every mutating endpoint. The limit is shared per user across all endpoints.
- **Use Drizzle's query builder.** Do not build SQL by concatenating strings. Raw SQL fragments should use Drizzle's `sql` template tag so that values are parameterised.
- **Put shared reads in `queries.ts`.** If more than one route needs a query, move it into `src/lib/server/queries.ts` rather than duplicating it.

### Changing the database schema

The schema is defined in more than one place, because the application creates its own tables at runtime rather than relying on a separate migration step. A schema change usually involves all of the following:

1. **`src/lib/server/db/schema.ts`**: update the Drizzle table definition, so that queries and types are correct.
2. **`src/lib/server/db/index.ts`**: update the `CREATE TABLE IF NOT EXISTS` statements so that new databases are created correctly. For a new column on an existing table, add an idempotent `ALTER TABLE ... ADD COLUMN` step to `ensureSchema()` so that existing databases are upgraded automatically.
3. **`scripts/`**: for changes that existing production data depends on, add or extend a SQL migration and use `scripts/run-migration.mjs` (or `turso db shell`) to apply it. Scripts must be safe to run more than once.

Prefer additive changes: new nullable columns, or columns with defaults, and new tables. SQLite cannot drop or alter a column constraint in place, so renaming or tightening a column means rebuilding the table. Discuss that kind of change in an issue first.

Before you merge a schema change, test it against a fresh database and against a copy of a database created by the current `main`. Consider foreign keys, `ON DELETE CASCADE` behaviour, and what happens to existing rows.

### Svelte components

- Use Svelte 5 runes. Declare props with `$props()`, derive values with `$derived`, and reserve `$effect` for synchronising with things outside Svelte, such as d3 or the DOM.
- Pass callbacks as props (for example `onSubmit` and `onClose`) instead of dispatching events, to match the existing components.
- Keep a component's public props stable unless the change requires them to change, and update every call site if they do.
- **Take particular care with `GraphCanvas.svelte`.** It combines reactive Svelte state with d3-force's imperative tick loop. The effect that copies server data into the simulation must never read state that it, or the tick handler, writes; otherwise it retriggers on every animation frame. `tests/graph-canvas.test.ts` guards against this, and any change to the canvas should keep that test passing.

### Relation types

The eight built-in relation types, together with their labels, reading phrases, colours, and directionality, are defined only in `src/lib/shared/relations.ts`. The graph legend and the relation form both read from this file, so change them there. Map-specific types are stored in the `relation_types` table and should not be added to the built-in list.

### Interface and accessibility

- Every interactive element must work with the keyboard and show a visible focus state.
- Use semantic elements (`button`, `a`, `label`, `nav`, `main`) and give icon-only controls an accessible name.
- Check text contrast in both the light and dark themes.
- Test at phone width as well as on desktop, and make sure the page never scrolls horizontally.
- Reuse the existing `cc-` classes and Tailwind tokens rather than introducing one-off colours or spacing.
- Colour must never be the only signal. Relation types, for instance, are also distinguished by their label and their arrowheads.

### Testing

Tests live in `tests/` and run in jsdom. `tests/setup.ts` supplies stand-ins for browser APIs that jsdom lacks, such as `ResizeObserver` and pointer capture.

- Add a test when you fix a bug that could plausibly return, and when you add behaviour to a form or the graph canvas.
- Mount components with Svelte's `mount()` and call `flushSync()` after interactions, following the existing tests. `tests/Harness.svelte` shows how to drive a component with reactive props.
- Assert on behaviour a user would observe, not on internal implementation details.

### Documentation

If a change affects setup, configuration, deployment, or user-visible behaviour, update the README or the relevant guide in the same pull request. The documentation pages are Markdown files in `src/lib/content/docs`. To add a new page, register it in both `src/routes/docs/[slug]/+page.svelte` (where it is listed and rendered) and `src/routes/docs/[slug]/+page.server.ts` (which links to its GitHub history).

## Security

Do not open a public issue for a security vulnerability, such as a way to bypass authorization, read another map's data, or evade rate limiting. Contact the maintainers privately through GitHub, include clear reproduction steps, and allow time for a fix before disclosing the problem publicly.

Because sign-in is deliberately lightweight (a display name, with no password), be cautious with any change that grants new powers to a signed-in user, and make sure destructive actions stay restricted to the appropriate owner.

## Conduct

Be precise, respectful, and generous in technical discussion. Assume good faith, ask questions before drawing conclusions about intent, and credit the work you build on. A good review names a specific risk or gap, explains why it matters, and suggests a way forward. Maintainers may remove comments or contributions that are hostile, discriminatory, or in bad faith.

## Licensing and attribution

By submitting a contribution, you agree that it may be distributed under the project's licence. Contributors are credited through the Git history. If you would like to be acknowledged in some other way, mention it in your pull request.

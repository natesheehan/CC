# Concept Cartography

An interactive concept-mapping tool built with **Svelte 5 + SvelteKit**. Create maps, add
concepts with definitions/sources/examples/quiz questions, and link them with typed
relationships. Every map renders as a live, draggable network graph, and every edit is
attributed to a signed-in user and recorded in an activity log.

## Features

- **Maps** — create and browse any number of concept maps from a dashboard.
- **Concepts** (graph nodes) — each has a name, a definition, a link to the source
  literature, an example, and an optional quiz question.
- **Relations** (graph edges) — link any two concepts with one of eight typed relations:
  Type of, Part of, Produces, Counteracts, Similar to, Equivalent to, Distinct from,
  Depends on. Each type has its own color; directional relations (e.g. "Produces") get
  an arrowhead, symmetric ones (e.g. "Similar to") don't.
- **Network graph view** — force-directed layout (drag to arrange, pan, zoom), positions
  persist per concept so the layout is stable across sessions and editors.
- **Search** — find an existing concept by name before creating a duplicate, or to jump
  straight to it and see its metadata.
- **Click-to-inspect** — clicking any node opens a panel with its full metadata and its
  incoming/outgoing relations.
- **Tracking** — every concept and relation records who created/last edited it and when;
  a per-map activity feed lists every change in order. Dragging a node to reposition it
  is *not* logged as a content edit — only actual edits to a concept's fields are.
- **Live collaboration** — see who else is on a map right now (avatars in the map header),
  their cursors on the canvas, and a ring on whichever concept each person is looking at or
  editing. Changes by others appear without a reload (with a toast you can click to jump to
  them), nodes they drag glide into place, and edit dialogs warn you if someone else is
  editing — or has just saved — the same concept or link. You can jump to or *follow*
  any collaborator's view. Works over a lightweight heartbeat (`POST /maps/:id/live`), so it
  needs no extra infrastructure on serverless hosting.
- **Sharing** — each map is *public, anyone can edit* (the default, and what every map
  created before sharing existed became), *public, invite to edit* (everyone can view; only
  invited people edit), or *private* (only invited people can see or edit). The owner invites
  people by sign-in name or with an invite link they can reset or turn off. Private maps are
  hidden everywhere: dashboard, concept dictionary, community page and live presence.
  Rules live in `src/lib/shared/access.ts` and are enforced in `src/lib/server/access.ts`.
- **Versions** — save a named snapshot of a map, preview it read-only on the canvas, download
  it, or restore it. A restore first saves the current state as an automatic version, so it
  can be undone. Concepts and links keep their ids, so discussion threads survive.
- **Simple named sign-in** — no passwords. Enter a display name once; a cookie keeps you
  signed in as that person so your edits are attributed correctly.
- **Persistent storage** — SQLite-compatible storage (libSQL), so maps survive restarts
  and can be edited by multiple people over time — including on serverless platforms.

## Tech stack

- [SvelteKit](https://svelte.dev/docs/kit) (Svelte 5, runes) with `@sveltejs/adapter-vercel`
- SQLite-compatible storage via [Turso](https://turso.tech) (libSQL) + [Drizzle ORM](https://orm.drizzle.team/)
  — the exact same client works against a plain local file in dev and a hosted Turso
  database in production, so there's no separate "prod database" code path
- `d3-force` for the graph's force-directed layout (rendered as plain SVG, no chart
  library/canvas dependency)
- Tailwind CSS

## Getting started (local dev)

```bash
npm install
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`). With no environment
variables set, the app stores data in a local SQLite file at `./data/conceptmap.db` —
created and migrated automatically on first run. No Turso account needed to develop
locally.

## Deploying to Vercel

1. **Create a Turso database** (the free tier is plenty to start). The Turso CLI installs
   via a shell script, not npm:
   ```bash
   curl -sSfL https://get.tur.so/install.sh | bash   # or: brew install tursodatabase/tap/turso

   turso auth login
   turso db create concept-cartography
   turso db show concept-cartography --url
   turso db tokens create concept-cartography
   ```
   Alternatively, skip the CLI entirely and use Vercel's own integration: in your Vercel
   project, go to **Storage** (or **Integrations** → Marketplace) → add **Turso** — it
   provisions the database and wires up env vars for you (as `TURSO_DATABASE_URL` /
   `TURSO_AUTH_TOKEN`, which this app also recognizes automatically).
2. In your Vercel project's **Settings → Environment Variables**, add:

   | Variable              | Value                                       |
   | ---------------------- | --------------------------------------------- |
   | `DATABASE_URL`        | the `libsql://...turso.io` URL from step 1   |
   | `DATABASE_AUTH_TOKEN` | the token from step 1                        |

3. Push to your connected Git repo (or run `vercel deploy`). `@sveltejs/adapter-vercel`
   handles the rest automatically — no `vercel.json` needed.

The database schema (tables/indexes) is created automatically the first time the
deployed app handles a request, so there's no manual migration step. `npm run db:push`
(Drizzle Kit) is also available if you'd rather manage schema changes explicitly against
`DATABASE_URL`/`DATABASE_AUTH_TOKEN`.

### Deploying elsewhere (a VPS, Railway, Fly.io, etc.)

Everything above still applies — the app doesn't care whether it's running on Vercel's
serverless functions or a long-lived Node process, since persistence goes through the
same libSQL client either way. If you'd rather not use Turso, any libSQL-compatible
server works, or point `DATABASE_URL` at a local file path
(`file:./data/conceptmap.db`) on a host with a persistent disk, exactly like local dev
— just swap the adapter in `svelte.config.js` back to `@sveltejs/adapter-node` if you
want a plain long-running server instead of serverless functions.

### Keeping hosting costs down

- **Put functions next to the database.** Set `VERCEL_FUNCTION_REGIONS` (build-time env var
  in Vercel → Settings → Environment Variables) to the Vercel region closest to your Turso
  database, e.g. `fra1` for a Frankfurt database, `iad1` for US East, `dub1` for Ireland.
  Find the database region in the Turso dashboard or with `turso db show <name>`. Every
  request makes at least one database round trip and Vercel bills for the time a function
  is alive, so a cross-region round trip (~50–150 ms) is paid on every request. Unset =
  Vercel's project default (no change).
- **Small endpoints use 256 MB.** The live heartbeat, node positions and the map mutation
  endpoints share one low-memory function (`src/lib/server/functionConfig.ts`) — a Pro /
  Enterprise feature. After deploying, check the function's memory in the Vercel dashboard;
  if the project uses Fluid compute CPU presets, Vercel may apply the preset instead.
- **Schema setup runs once per schema change, not per cold start.** A fingerprint of the
  schema SQL is stored in `schema_meta`; cold starts compare it with one read and only run
  the full setup when it differs.
- `scripts/live-load-test.mjs` measures the live-collaboration cost (requests, writes,
  latency, DB time) against a running server — point it at a throwaway database.

Environment variables:

| Variable              | Default                      | Purpose                                        |
| ---------------------- | ------------------------------ | ------------------------------------------------- |
| `DATABASE_URL`        | `file:./data/conceptmap.db`   | libSQL connection URL (local file or Turso)      |
| `DATABASE_AUTH_TOKEN` | _(unset)_                      | Auth token, required for a remote Turso database |
| `VERCEL_FUNCTION_REGIONS` | _(unset)_                  | Build-time: comma-separated Vercel regions to pin functions to (e.g. `fra1`) |

### Type-checking & tests

```bash
npm run check   # svelte-check
npm test        # vitest — includes a regression test for the graph's
                 # force-simulation reactivity (see Design notes below)
```

## Contributing to the software

Concept Cartography welcomes focused contributions to the code, documentation, tests,
accessibility, and design. Start locally with `npm install` and `npm run dev`; without
database environment variables, development uses `./data/conceptmap.db`. Create a branch,
keep changes focused, and follow the existing boundaries: server database access belongs in
`src/lib/server`, shared types and relation metadata belong in `src/lib/shared`, and
route-specific UI belongs beside its route.

Before opening a pull request, run `npm run check` and `npm test`. Describe what changed,
why it changed, and how it was verified. Include screenshots for meaningful UI changes and
call out any migration or deployment requirements. For larger changes, open an issue first
so the direction can be discussed. Documentation and examples are contributions too.

## Project structure

```
src/
  lib/
    server/
      db/            Drizzle schema + libSQL connection (auto-creates tables)
      auth.ts         Named sign-in + cookie sessions
      activity.ts      Audit log read/write helpers
      queries.ts        Shared read queries for maps/concepts/relations
    shared/
      relations.ts    The 8 relation types: labels, colors, directionality
      types.ts         Client-facing TypeScript types
      format.ts        Small date-formatting helper
    components/
      GraphCanvas.svelte      Force-directed SVG network graph (drag/pan/zoom)
      ConceptPanel.svelte      Metadata panel for a selected concept
      ConceptFormModal.svelte   Add/edit concept form
      RelationFormModal.svelte   Link two concepts with a typed relation
      ActivityFeed.svelte        Recent-edits sidebar
      SearchBar.svelte            Find an existing concept
  routes/
    +page.svelte / +page.server.ts        Dashboard (list/create maps)
    login/                                  Named sign-in
    maps/[id]/+page.svelte                  The map editor (graph + panels)
    maps/[id]/concepts/...                  Concept CRUD endpoints
    maps/[id]/relations/...                 Relation CRUD endpoints
tests/
  graph-canvas.test.ts   Regression test for GraphCanvas's reactivity
  Harness.svelte           Test-only wrapper that feeds it reactive props
```

## Design notes / things you may want to extend

- **Concurrent editing** is supported in the sense that multiple people can open and
  edit the same map over time — every change re-fetches fresh data (`invalidateAll`)
  after a mutation. There isn't live multiplayer (no WebSockets/CRDT), so two people
  editing at the exact same moment won't see each other's cursors; the last write wins
  and everything is still fully attributed in the activity log.
- **Auth** is intentionally minimal (name only, no password) per the current
  requirements. If you need real accounts later, `src/lib/server/auth.ts` is the only
  place that needs to change — everything else just depends on `locals.user`.
- **Relation directionality**: edit `src/lib/shared/relations.ts` to change colors,
  labels, or add new relation types — both the graph legend and the link-creation form
  pull from that single source of truth.
- **GraphCanvas reactivity**: the force-directed layout mixes Svelte 5's reactive state
  with d3-force's imperative tick loop. The effect that reconciles server data into the
  simulation is carefully written to never re-read the state it (or the tick handler)
  just wrote — otherwise it retriggers itself every animation frame. `tests/graph-canvas.test.ts`
  guards against regressing this.

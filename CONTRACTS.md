# Tick — build contracts (agent coordination doc)

Read `handoff_design_Tick/design_handoff_tick/README.md` first (data rules, screens), plus `BRIEF.md`.
Design mocks: `handoff_design_Tick/design_handoff_tick/*.dc.html` + its `screenshots/`.
That bundle is local-only (gitignored, not shipped) — it exists on this machine as build reference. The README's screenshots are copies in the tracked `screenshots/` folder.
Shared DTO types: `shared/types/index.ts` (auto-imported in app + server). Do not redefine DTOs.

**Stack (installed):** Nuxt 4.5 · @nuxt/ui 4.11 · Pinia · GSAP · nuxt-auth-utils · drizzle-orm + postgres.js · zod · @vueuse/nuxt. Dev DB is live: see `.env`.

**Hard rules**
- Prefix shell commands with `rtk` wherever it proxies them (`rtk git status`, `rtk npm run build`, `rtk grep …`) — token-optimized CLI proxy, installed. Skip for custom scripts/psql/node one-offs; `rtk proxy <cmd>` = raw passthrough.
- Never run `npm install` or edit `package.json` (QA agent excepted) — report missing deps in your final text instead. Never start a dev server (QA agent excepted, port 3790).
- Passwords: `server/utils/password.ts` (owned by schema agent) exports `hashPassword(pw)` / `verifyPassword(pw, stored)` using node:crypto scrypt, format `salt:hex`. Auth + seed both use it — not nuxt-auth-utils' built-ins.
- Nuxt UI components everywhere they fit; all colors via semantic tokens (`primary`, `neutral`, `--ui-*`). Never hard-code Nocturne hex values.
- Entries store only the deepest ref (Rule 1). Rates resolve server-side (Rule 2). Everything soft-deletes (`deleted_at`), 30-day trash (Rules 3–4).
- Timer = `time_entries` row with `end IS NULL`, max one per user.
- Tabular numerals (`.tnum`) on every time/money figure. Headings weight 500 max. Primary buttons outlined, accent never a large fill.
- Each agent creates/edits ONLY files it owns (listed in its prompt). Read anything.

## API surface (server routes, all under `/api`, JSON, zod-validated, session-guarded except /auth)

Auth (nuxt-auth-utils):
- `POST /api/auth/register` {name,email,password} → creates user + personal org (role owner), sets session
- `POST /api/auth/login` {email,password} → session; `POST /api/auth/logout`
- Session payload = `SessionUser` (shared types). Server helper `requireAuth(event)` → SessionUser (throws 401).

Timer:
- `GET /api/timer` → TimerState|null
- `POST /api/timer/start` {name?,refType?,refId?,billable?} → TimerState (stops nothing; 409 if already running)
- `PATCH /api/timer` {name?,refType?,refId?|null,billable?} → TimerState
- `POST /api/timer/stop` → EntryDto|null (null = <1s discard)

Entries:
- `GET /api/entries?from=ISO&to=ISO` → EntryDto[] (desc by start; excludes running + trashed)
- `POST /api/entries` {name,refType?,refId?,billable?,rateOverride?,start,end,tags?} → EntryDto
- `PATCH /api/entries/:id` (same partial fields) → EntryDto
- `DELETE /api/entries/:id` → DeleteResult ·  `POST /api/entries/bulk` {ids, action:'delete'|'billable'|'restore', billable?} → DeleteResult|count

Catalog (clients/projects/tasks/tags — same CRUD shape):
- `GET /api/clients` → ClientDto[] · `POST /api/clients` {name,rate?} · `PATCH /api/clients/:id` · `DELETE /api/clients/:id` body {cascadeProjects,cascadeTasks,cascadeEntries} → DeleteResult
- `GET /api/clients/:id/cascade` → CascadeCounts (for dialog)
- `GET/POST/PATCH/DELETE /api/projects` (+ `/:id/cascade`, DELETE body {cascadeTasks,cascadeEntries}) — ProjectDto
- `GET/POST/PATCH/DELETE /api/tasks` — TaskDto · `GET/POST/DELETE /api/tags` — TagDto (tag delete strips labels only)
- `POST /api/restore` {deleted: DeleteResult['deleted']} → restores a DeleteResult snapshot (undo)

Dashboard: `GET /api/summary/dashboard` → DashboardSummary

## Pinia stores (app/stores/*.ts)

- `useTimerStore` — state {timer: TimerState|null, elapsedSec}; getters running; actions hydrate(), start(), stop() (returns EntryDto|null), update(patch), attach(refType,refId), detach(), toggleBillable(). Ticks elapsedSec every 1s while running; persists nothing itself (server is truth; hydrate on app mount).
- `useEntriesStore` — state {entries, selection:Set, filter, groupBy:'day'|'project', undoStack}; actions fetchRange(from,to), addManual(payload), remove(id), bulkDelete(), bulkBillable(bool), restore(deleted), applyStoppedEntry(dto). Filter parses `#tag` `@name` free text.
- `useCatalogStore` — {clients, projects, tasks, tags} + fetchAll() + create/update/remove per entity (calls API, refreshes).
- `useThemeStore` — {preset, primary, neutral, radius, font, mode, starfield}; action apply() → updateAppConfig ui.colors + sets `--ui-radius`/`--font-sans` on :root + colorMode; persist localStorage `tick-theme` + PATCH /api/me/theme (jsonb).
- `useUiStore` — {pickerOpen, pickerTarget:'timer'|'manual', manualOpen, cascade:{open, kind, id}}.

## Shared components (owner in parens)

- `AppSidebar`, `TimerBar`, layout `default.vue` (shell agent). TimerBar consumes useTimerStore + opens picker via useUiStore.
- `PickerModal` (time agent) — props none; reads useUiStore.pickerTarget; emits nothing; on pick calls timer.attach() or fills manual dialog via useUiStore state {pickerResult}. Tabs Client/Project/Task, search, create-inline, keyboard nav (see README §Picker modal).
- `ManualEntryDialog` (time agent) — free-text date/time/duration parsers in `app/utils/parse.ts` (exported: parseDate, parseTime, parseDuration, formatDuration, formatMoney).
- `CascadeDeleteDialog` (manage agent) — reads useUiStore.cascade; downward-cascading checkboxes + outcome panel per README Rule 3.

## Routes

`/` dashboard · `/time` · `/calendar` (stub swing 2) · `/reports` (stub swing 2) · `/projects` · `/clients` · `/tags` · `/settings` (tabs; only Appearance built) · `/login` `/register` (no shell). Global auth middleware redirects logged-out → /login (allow /login, /register).

## Seed (dev)

`npm run db:seed` → org "Hollow Studio", user Mara Juhl `mara@example.com` / `tick-demo`, $85/h default; clients Northwind Legal/Acme Co/Playtone w/ colors; projects (Intake form $95/h, Website redesign, Homepage hero…), tasks, tags (meeting, design, dev); ~3 weeks of entries incl. today matching screenshots (Intake form validation 1:00–2:45pm billable, Standup+planning #meeting 30m non-billable, Hero layout pass #design 9:05–11:20am…).

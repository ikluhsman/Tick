# Handoff: Tick — time tracker

## Overview
Tick is a self-hosted, MIT-licensed time tracker for freelancers and small teams: a SolidTime-style app with a better entries list, safer deletion, typed dates, an open-ended client/project/task model, and a Nuxt UI theme editor. Desktop layout: left sidebar (org, nav), sticky timer bar across the top of the main column, page content beneath. Mobile: bottom tabs with the timer docked above them.

## Original brief
`BRIEF.md` is the product owner's original request, verbatim, with the decisions made during design appended. Read it first.

## About the design files
Everything in this bundle is a **design reference built in HTML** (`*.dc.html`). It shows intended look and behavior; it is not production code. Recreate it in the target stack below using its own components and patterns. Where this README and the HTML disagree, the HTML wins for visuals and this README wins for data rules.

## Target stack (from the product brief)
Nuxt 3 + Nuxt UI (components, color mode, fonts) · Tailwind CSS · Pinia · PostgreSQL · Docker (GHCR image) + native PM2 option · Nuxt Content for docs · GSAP for transitions/chart draw-in · D3 or Chart.js only where Nuxt UI lacks a chart · SMTP via `.env` · PWA, mobile-first. `.env.example` must cover host/port, DB URL, session secret, SMTP, demo-reset flag.

## Fidelity
**High-fidelity for layout, hierarchy, spacing, copy and interaction.** The visual skin in the mocks is the "Nocturne" reference theme (dark, blurple accent, Inter, 8px radius). In production the skin is *whatever the theme editor produces*, so implement every color via Nuxt UI semantic tokens (`primary`, `neutral`, `--ui-bg`, `--ui-text`, `--ui-border`, `--ui-radius`) rather than hard-coded values. Treat the Nocturne values in "Design tokens" as the default preset.

## Screenshots
`screenshots/` — one PNG per desktop screen (01 time … 08 settings), plus the Manual-entry and cascade-delete dialogs, and the three mobile screens.

## Files
- `Tick.dc.html` — desktop app: Time, Dashboard, Reports, Calendar, Projects & tasks, Clients, Tags, Settings→Appearance, all dialogs and toasts. Fully interactive; read the logic class at the bottom for exact rules.
- `Tick Mobile.dc.html` — three phone screens: Time (timer running, swipe row), picker bottom sheet with keyboard, Dashboard.
- `Tick Logo.dc.html` — logo at 420px plus favicon (24) and app-icon (48) variants. SVG is inline; copy as-is.
- `_ds/…/styles.css` — reference token sheet the mocks read from.

---

## Data model

### Entities
```
users        id, name, email, default_rate (money/h), theme (jsonb), role
orgs         id, name; org_members(org_id, user_id, role: owner|admin|member, rate?)
clients      id, org_id, name, rate?
projects     id, org_id, name, client_id?, rate?, billable_default bool, estimate_minutes?, visibility: private|public, archived
tasks        id, org_id, name, project_id?, estimate_minutes?, done bool
tags         id, org_id, name (unique per org, lowercase)
time_entries id, org_id, user_id, name, ref_type: null|client|project|task, ref_id?,
             billable bool, rate_override?, start timestamptz, end timestamptz?, deleted_at?
entry_tags   entry_id, tag_id
```
Timer = a `time_entries` row with `end IS NULL`; one per user max.

### Rule 1 — store only the deepest reference
An entry stores exactly one of `client | project | task | nothing`. Project and client are **derived at read time**: `task → task.project → project.client`. Never copy project_id/client_id onto the entry. Reassigning a task to another project therefore re-files its history automatically; that is intended.

### Rule 2 — rate inheritance (first non-null wins)
`entry.rate_override → project.rate → client.rate → org_member.rate → user.default_rate`.
`billable` defaults from `project.billable_default` when a project is resolvable, else `true`. Amount = hours × resolved rate, only when `billable`.

### Rule 3 — cascade delete (clients, and the same pattern for projects)
Dialog: "Delete {client}?" with three checkboxes that **cascade downward**: Projects ⇒ Tasks ⇒ Time entries. Checking Projects auto-checks Tasks and Entries; unchecking Entries unchecks the two above. Counts shown per row. An outcome panel spells out what happens to anything unchecked:
- Projects unchecked → projects kept, `client_id` cleared, rate falls back per Rule 2 (say so with the resulting $/h).
- Tasks unchecked → kept; if projects were deleted they become standalone (`project_id` null).
- Entries unchecked → kept; entries pointing directly at the deleted object get `ref_type = null` (time is never lost silently). Entries pointing at a surviving task/project are untouched.
Everything deleted goes to **trash** (soft delete, `deleted_at`), restorable for 30 days from Settings → Trash. Show an undo toast.

### Rule 4 — deleting entries
- Single: immediate soft-delete + undo toast (default 8s, countdown visible, configurable 3–30s).
- Bulk: select checkboxes → action bar → confirmation dialog stating count and total hours → trash + undo toast.
- Deleting a **tag** strips the label from entries and never touches time.

### Simple ↔ project mode
There is no mode switch. Every entry is "simple" until the user attaches a client/project/task via the **+** button in the timer bar. Attaching a task shows the whole chain (`Task · Project · Client`) as one removable chip. Removing the chip returns to simple.

---

## Screens

### Shell (desktop ≥ 1024px)
- Sidebar 224px, sticky, full height. Contents top→bottom: logo + wordmark (42px mark, 20px/500 name), org switcher (outlined, 22px square avatar with initials), nav (Dashboard, Time, Calendar, Reports), "MANAGE" kicker (10px, tracking .1em, uppercase, neutral-600), nav (Projects & tasks, Clients, Tags, Settings), user footer (28px round avatar, name 13px, "Owner · $85/h default" 11px). Active nav item: surface bg + 2px accent inset bar on the left, text = text color; inactive = neutral-400. Item padding 7px 10px, radius md, 14px/500.
- Sidebar background: optional starfield (nine tiny radial-gradient dots at ≤ .8px, 30–70% white) over `linear-gradient(180deg, neutral-900 0%, bg 70%)`. Toggle in Appearance ("Starfield / Plain"); off automatically in light mode.
- Main column: sticky timer bar (padding 11px 22px, bg = 86% page bg + `backdrop-filter: blur(12px)`, 1px bottom border) then page content with 22px padding, max-width 1100px (1200 for Calendar), 120px bottom padding.

### Timer bar (every page)
One rounded surface (radius lg, shadow sm, padding 6px 6px 6px 14px), flex, gap 8px:
1. Input, borderless, 15px, placeholder "What are you working on?". Enter starts/stops.
2. Chain chip (only when attached): `tag-accent` style with an 18px square × button.
3. **+** icon button (34px, outlined). Opens a dropdown: Client (count) / Project (count) / Task (n open), each row icon + label + count; footer hint "Type # for tags, @ for projects".
4. Billable toggle: outlined button, `$` icon + resolved rate "$110/h"; when off reads "Not billable" in neutral-500 with divider border.
5. Clock `HH:MM:SS`, 24px/500, tabular numerals, accent-300 while running, neutral-500 idle, right-aligned min-width 118px.
6. Start/Stop: 40px circle, **outlined** accent (never filled). While running: stop glyph, and a glow keyframe (`box-shadow 0 0 12px → 26px accent at 30–65%`, 2s ease-in-out infinite).
Stopping with <1s elapsed discards. Stopping otherwise inserts the entry at the top of Today and navigates to Time.

### Picker modal (client / project / task)
Dialog 520px, anchored 12vh from top. Tabs Client / Project / Task (outlined pills, active = accent border+text). Search input autofocused, placeholder "Search open tasks…". Rows 9px 10px: 8px color dot (client color), name 14px, sub-line 12px neutral-500 (task → "Project · Client"; project → client name or "No client"; client → "n projects"), right meta (rate or estimate). Completed tasks are hidden. No match → dashed "Create “{query}”" row. Footer hint: "Picking a task brings its project and client along. ↑↓ move · ↵ pick · esc close". Same modal serves the timer bar and the Manual-entry dialog (`modalTarget`). Must paginate/virtualize for large lists.

### Time page
Header: h1 "Time" 28px, subline "{week total} this week · {billable} billable · {$} unbilled". Right: segmented By day / By project, filter input (placeholder "Filter, #tag, @project", matches name, `#tag`, `@project/client/task`), primary button "Manual entry".
Groups: heading row (label 16px/500, date 12px muted, total right-aligned) then a surface card (radius lg, shadow sm) of rows.
Row grid: `30px | 1fr | auto | auto | auto | 64px`, gap 11px, padding 9px 8px 9px 6px, 1px 6%-text inset separator, hover 4% tint, selected = accent-900 bg.
- Checkbox 18px radius-sm, accent when checked.
- Name 14px + `#tag` neutral tags (10px). Second line 12px neutral-500: client dot + chain `Task · Project · Client` (client name in accent-300). No wrapping (`white-space: nowrap` on chain parts).
- Time range "9:05am – 11:20am" 12px muted, tabular.
- Billable toggle 26px square outlined `$` (accent-600 border / accent-300 icon when on; neutral-800 / neutral-600 off). Tooltip "Billable at $110/h".
- Duration "2h 15m" 14px/500 with amount "$248" 11px beneath (amount hideable via preference `showAmounts`).
- Row actions (ghost 30px): ▶ start again (copies name/ref/billable to the timer and starts), 🗑 delete (Rule 4).
Selection bar appears above groups when ≥1 selected: accent-900 bg with accent-700 ring, "n selected", Clear, Mark billable, Delete.
Group labels: Today, Yesterday, weekday name (<7 days), else "Wed, Sep 2" (add year if different).
Empty state card: "Nothing here yet — Start the timer above, or add a manual entry."

### Manual entry dialog
560px. Fields: description; "Client, project or task" (button styled as input, opens picker) + billable toggle with resolved rate; a 4-column row **Date / Start / End / or Duration**; tags (comma list). **Date is free text**, parsed live: `2025-03-14`, `3/14/25`, `mar 14`, `14 mar 2025`, `today`, `yesterday`, `last tue`, `tue`; unparseable → "Couldn't read “…” as a date." Times: `9`, `9:30`, `2pm`, `14:15`. Duration: `2h 30m`, `1.5h`, `90m`, `1:30`. A status line under the fields shows the interpretation ("Sat, Mar 14, 2025 · 9:00am – 11:30am · 2h 30m") in accent-300 when valid, neutral-400 otherwise; duration without start logs from 9:00 and says so. "Add entry" disabled until valid. Saved entries sort into their day group.

### Dashboard
Greeting h1 ("Good afternoon, Mara"), date subline. Stat cards (auto-fit ≥170px): Today / This week / Billable / Unbilled, kicker 10px accent, value 26px/500 tabular, meta 11px. Then a 1.5fr / 1fr grid: **Activity** (16 week columns × Mon–Fri rows of 13px dots, labels "M T W R F"; dot = accent with opacity .1 (none) → .25–1.0 by hours; ≥ 75% adds a 8px accent glow) and **Billable this week** donut (r 50, stroke 8, neutral-800 track, accent arc with drop-shadow glow, % in the middle, legend beneath). Then **This week**: 7 rows Mon–Sun, 8px pill bars = accent (billable) + neutral-700 (non-billable) segments, hours right. Cards are user-toggleable (show/hide) but not freely arrangeable. Animate bars/donut/dots in with GSAP on mount.

### Reports
Header subline "{Range} · Sep 7 – Sep 13 · n entries". Controls: range segmented (This week / Last week / This month; add custom range in build), billable segmented (All / Billable / Non-billable), CSV (secondary), Export PDF (primary).
Stat cards: Tracked (n working days), Billable (% of tracked), Amount (avg $/h), Per day (avg on worked days).
**Hours by day**: stacked column chart, one column per day of the range (weekday labels for ≤7 days, day numbers otherwise), 180px tall, segments colored by the current grouping (series palette: accent, accent-2-600, neutral-400, accent-800, neutral-600 — reuse across chart & table), total hours above each column, legend top-right (top 5 groups).
**Breakdown** table, regroupable by Client / Project / Task / Tag: color chip + label + sub (parent) · share bar + % · Entries · Hours · Billable (accent-300) · Amount; Total row. "No client / No project / No task / Untagged" buckets are real rows.

### Calendar (week)
Controls: Week/Day segmented (Day view not designed), ‹ Today ›, range title. Grid: 52px hour gutter + 7 equal columns, header per day: weekday 11px uppercase, day number in a 28px circle (accent ring on today), total hours. Body 7am–7pm at 48px/hour, hour rules at 5% text, weekend columns tinted 2%. Entry blocks: absolute by start/duration (min 22px), 2px left edge (accent billable / neutral-500 not), bg accent-900 / neutral-800, name 11px/500, sub 10px; click = start again. Today gets an accent "now" line with a 6px dot. Build: drag-to-create, drag-move, edge-resize (snap 5 min), Day view for mobile.

### Projects & tasks
Header: "n projects · n open tasks · n done", buttons New task (secondary) / New project (primary). One collapsible card per project: grid `1fr | 220px | 90px | 24px`: client dot + name 15px/500 + tag (billable/internal), subline "Client · x/y tasks open · rate source" ("$95/h", "$110/h from client", "$85/h default"); progress bar tracked vs estimate (accent; accent-300 when over estimate) with "6h 30m tracked / 40h estimated"; amount; chevron. Expanded: task rows `22px | 1fr | 110px | 80px | 30px`: done radio (accent when done, name struck through neutral-600), name, "n entries", tracked, ▶ start. "+ Add task" ghost link. Below: **Standalone tasks** card with the same row layout. Forms (not drawn): Project = name, client picker, billable default, rate, estimate ("2h 30m"/"40h" parser above), visibility. Task = name, project picker, estimate, completed.

### Clients
Table card: Client (26px round avatar w/ initials in client color) · Rate ("$110/h" or "$85/h (default)" muted) · Projects · Tasks · Tracked (+ amount muted) · edit / delete. Delete → cascade dialog (Rule 3). Client form = name + optional rate. Each client gets a deterministic color from a short palette (accent-400, accent-2-600, neutral-400, accent-600) used for dots everywhere.

### Tags
Header with inline "New tag" input + Add (Enter works; lowercased, `#` stripped, deduped). Table: `#tag` chip · Used on (distinct projects/clients) · Entries · Hours · Last used · filter (jumps to Time with `#tag` in the filter) / delete (strips label, undo toast). Footer note about merging by rename.

### Settings → Appearance (theme editor)
Tabs: Appearance · Profile · Organization · Members & roles · Trash · Import (only Appearance designed). Header buttons Reset / "Copy app.config.ts".
Left column: **Presets** (cards showing accent dot, surface dot, radius sample, name in its own font, sub) — Nocturne, Daylight, Ember, Orchard, Lagoon; **Primary** 32px swatches (violet, indigo, sky, teal, emerald, amber, rose, fuchsia); **Neutral** split swatches (slate, zinc, stone, gray, neutral); **Radius** segmented None/Sm/Md/Lg/Xl = 0/4/8/12/16px; **Mode** Dark/Light; **Font** rows (Inter, DM Sans, IBM Plex Sans, Manrope, Source Sans 3) rendered in their face; **Sidebar** Starfield/Plain.
Right column (sticky): live Sample card (timer bar, three button variants, input, three bars, 100–900 ramp strip) and the generated `app.config.ts`.
**Implementation with Nuxt UI:** swatch rows = `UColorPicker`-style buttons writing `appConfig.ui.colors.primary/neutral` (Tailwind palette names, so `bg-primary` etc. re-resolve); radius = `URadioGroup` → `--ui-radius` (rem); mode = `useColorMode()`; font = `USelectMenu` → `@nuxt/fonts` family swap; presets = named app.config overrides; persist to `users.theme` and apply on login. Everything reads live — no save button needed beyond Copy/Reset.

### Mobile (see `Tick Mobile.dc.html`)
Bottom tab bar: Dashboard, Time, Calendar, Reports, More (Projects, Clients, Tags, Settings). Timer is a docked card **above** the tabs on every screen (description, clock 22px, 44px circular start/stop; second line = chain chip, rate chip, + button). Time list: same day groups, rows show name, chain, duration + range; **swipe left** reveals a 72px "Delete" action (accent-900), **swipe right** = start again; undo toast as desktop. Picker = bottom sheet (grab handle, tabs, search, rows ≥ 48px, create row) with keyboard. All hit targets ≥ 44px. Dashboard stacks the four stat cards 2×2, then This week bars, then a 12-week activity grid.

---

## Interactions & motion
- Menus/dialogs/toasts enter with `translateY(8px) → 0, opacity 0 → 1`, 160–200ms ease-out.
- Running timer glow: 2s ease-in-out infinite (see keyframe above). Nothing else pulses.
- Row hover: 4% text tint. Buttons: hover 12% accent tint (primary), 7% text tint (secondary). Focus ring: 2px accent outline, offset 2px.
- Chart draw-in (GSAP): bars grow from 0 width/height, donut arc from 0, dots fade in staggered 8ms — 400ms, `power2.out`.
- Escape closes any open menu/dialog (picker inside Manual entry closes only the picker).
- Toast countdown ticks once per second; Undo restores exactly the removed rows (and, for cascade, the full snapshot).

## State (Pinia stores)
`timer` (running, startedAt, desc, ref, billable) · `entries` (list, selection, filter, groupBy, undo stack) · `catalog` (clients, projects, tasks, tags) · `reports` (range, billFilter, groupBy) · `calendar` (weekOffset) · `theme` (primary, neutral, radius, font, mode, sidebar) · `ui` (openMenu, modal + modalTarget, dialogs). Persist timer + theme in localStorage as well as server, so the clock survives reloads.

## Design tokens (Nocturne default preset)
Colors: bg `#161826` · surface `#232532` · text `#e9e9ed` · accent `#9184d9` · divider `text @ 16%`.
Neutral ramp 100–900: `#f3f5fe #e4e7f5 #cfd3e5 #b2b6ca #9397ab #75798c #595d6c #3f424d #292b31`.
Accent ramp 100–900: `#f5f4ff #e7e5fe #d2cefd #b5abfc #968ae0 #796cbf #5d5294 #423a6a #2b2741`.
Type: Inter; headings weight 500 (never bolder); body 14–15px; h1 28px; kickers 10px uppercase tracking .1em; numerals `font-variant-numeric: tabular-nums` wherever time or money appears.
Spacing scale: 2.8 / 5.6 / 8.4 / 11.2 / 16.8 / 22.4 px (Nuxt UI: use its spacing at density ~0.7).
Radius: sm 4 · md 8 · lg 14 (theme editor scales these from the chosen md).
Shadows (dark): sm `0 0 0 1px #3f424d` · md `0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,.55)` · lg `0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,.65)`. Light presets use soft drop shadows instead.
Rules: primary buttons are **outlined**, accent is never used as a large fill; chroma stays in lines, marks and glows.

## Assets
- Logo: inline SVG in `Tick Logo.dc.html` (viewBox 0 0 64 64, stroke = accent). Body is the dial, front legs are the hands, faint outer ring; favicon variant drops the ring and thickens strokes.
- Icons: Phosphor (per the reference theme) or Lucide via `@nuxt/icon`; the mocks use simple 2px stroke glyphs.
- Fonts: Google Fonts (Inter, DM Sans, IBM Plex Sans, Manrope, Source Sans 3) via `@nuxt/fonts`.

## Open items for the build
- Day view, drag-create/resize on Calendar; custom date range on Reports; CSV/PDF export contents.
- Project/Task/Client forms, Members & roles, Trash, Import (Toggl/Clockify/CSV) are named but not drawn.
- Light-mode contrast pass once a preset is chosen.
- Demo instance: nightly data reset + seeded sample org.

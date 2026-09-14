# Tick docs — maintainer guide

This is the Tick documentation site: a separate Nuxt 4 app (its own
`package.json`, independent of the main app in the repo root) built with
[Nuxt UI](https://ui.nuxt.com) and [Nuxt Content](https://content.nuxt.com).
Prose lives in `content/`; app shell and pages live in `app/`. It builds to a
fully static site — no server or database needed at runtime.

## Local development

From `docs/` (not the repo root):

```bash
npm ci          # installs from package-lock.json; plain `npm install` also works
npm run dev     # http://localhost:3000
```

Requires **Node 22.19 or newer** (the `better-sqlite3` dependency ships
prebuilt binaries only for recent Node 22/24 — see Troubleshooting below).

### Building and previewing a static export locally

```bash
npm run generate    # writes .output/public (a `dist` symlink also appears)
npx serve .output/public
```

Don't use `npm run build` for this site — that produces a Node server build
(`.output/server`), not a static export, and Netlify won't run a server for
this project. Always use `npm run generate`.

Note: when you run `generate` locally, Nitro picks the generic `static`
preset and writes `.output/public` plus a `dist` symlink pointing at it.
Netlify sets a `NETLIFY=true` environment variable during its build, which
makes Nitro pick the `netlify-static` preset instead and write `docs/dist` as
a real directory — that's the directory Netlify actually deploys (see
`netlify.toml` at the repo root, `publish = "dist"`). Both outputs render the
same site; only the preset and directory layout differ.

## Deploying to Netlify (via the UI)

You only need to do this once, when the site is first connected.

1. **Sign in to Netlify** at [app.netlify.com](https://app.netlify.com) (a
   GitHub login is fine).
2. **Start a new site from Git** — the option to import an existing project
   from a Git provider, from the Netlify dashboard or
   [app.netlify.com/start](https://app.netlify.com/start).
3. **Choose GitHub**, and authorize the Netlify GitHub App if this is the
   first time. When picking the repository, make sure the `ticktimer`
   GitHub org is selected/authorized — if `ticktimer/Tick` doesn't show up in
   the repo list, the GitHub App most likely hasn't been granted access to
   that org or that specific repo yet. That's controlled from your GitHub
   account (Settings → Applications → Installed GitHub Apps → Netlify →
   Repository access), not from Netlify. See Netlify's
   [repository permissions and linking](https://docs.netlify.com/build/git-workflows/repo-permissions-linking/)
   docs.
4. **Pick `ticktimer/Tick`** as the repository.
5. **Build settings**: leave these as detected/blank. This repo has a
   `netlify.toml` at the repo root with `base = "docs"`, the build command,
   and the publish directory already set, and those settings take precedence
   over anything typed into the UI. You shouldn't need to type a base
   directory, build command, or publish directory here at all.
6. **Deploy.** The first build runs immediately. It takes roughly 20–30
   seconds once queued (the `generate` step itself is under 20s).

Netlify assigns a random name and URL like `https://random-name-123.netlify.app`.
To change it: **Site settings → Site information → Change site name** (or
**Domain management → Options → Edit site name**), then pick something like
`ticktimer-docs`. Netlify.app subdomains are first-come-first-served, so if
your first choice is taken, try another.

### What triggers a deploy

- **Pushes to `main`** build and publish the production deploy at your
  `*.netlify.app` URL (or custom domain, once you add one).
- **Pull requests** against `main` automatically get a **deploy preview** — a
  throwaway URL built from that PR's branch, so you can review docs changes
  before merging. This is on by default; see Netlify's
  [deploy previews](https://docs.netlify.com/deploy/deploy-types/deploy-previews/)
  docs.
- **The `ignore` command** in `netlify.toml` skips the build entirely when a
  commit touches neither `docs/` nor the root `netlify.toml` — so pushes or
  PRs that only touch the main app, `test/`, etc. won't spend a build minute
  on the docs site.

### Checking a deploy

From the Netlify dashboard, the site's **Deploys** tab lists every deploy
with its status (building / published / failed) and a link to the build log.
Click any deploy to see the full log, or open the deploy's preview URL to
look at the actual output before it's promoted to production (this happens
automatically for `main`, but the deploy log and preview are there
regardless).

## Alternative: deploying with the Netlify CLI

You don't need this if the GitHub integration above is set up — it's here for
local one-off deploys or testing. From `docs/`:

```bash
npm install -g netlify-cli
netlify init      # first time: links this folder to a Netlify site, or creates one
netlify deploy --build --prod   # build + deploy straight to production
```

Leave off `--prod` to get a draft deploy URL instead of publishing. See
Netlify's [CLI getting-started guide](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/).

## Adding a custom domain later

1. Buy a domain from any registrar (Netlify can also register one for you,
   but that's not required).
2. In the Netlify dashboard: **Domain management → Add a domain**, then
   **Add a domain you already own**, and enter it.
3. **DNS records** — pick one:
   - **Subdomain** (e.g. `docs.ticktimer.dev`): add a **CNAME** record at
     your DNS provider pointing the subdomain at your `*.netlify.app`
     hostname.
   - **Apex/root domain** (e.g. `ticktimer.dev` with no subdomain): apex
     domains can't use CNAME. Either delegate the domain to **Netlify DNS**
     (simplest — Netlify manages every record), or, if you keep an external
     DNS provider, add an ALIAS/ANAME/flattened-CNAME record if it supports
     one, otherwise an A record. See Netlify's
     [external DNS configuration](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)
     and [Netlify DNS setup](https://docs.netlify.com/manage/domains/set-up-netlify-dns/)
     docs.
4. **HTTPS** is provisioned automatically once DNS resolves to Netlify — no
   certificate to generate or upload yourself.
5. **Point the old `*.netlify.app` URL at the new domain**: once the custom
   domain is verified, set it as the **primary domain** in Domain management;
   Netlify then redirects the `netlify.app` URL to it.

See the full walkthrough at Netlify's
[assign a domain to your site](https://docs.netlify.com/manage/domains/manage-domains/assign-a-domain-to-your-site-app/)
docs.

## Troubleshooting

- **Build fails with a Node/engine or native-module error (e.g.
  `better-sqlite3` failing to install or load):** this project requires
  **Node ≥ 22.19** (the repo pins `NODE_VERSION` in the root `netlify.toml`,
  so this shouldn't come up on Netlify itself unless that value is changed).
  Locally, check `node --version` and switch to a supported Node 22.x/24.x
  release if it's older.
- **A page 404s that should exist:** confirm the content file exists under
  `docs/content/` and that the build log shows it being prerendered (look for
  the route in the "Prerendered N routes" build-log section). A blank page
  (not a 404) after following a link usually means a caching issue — try a
  hard refresh; see the stale-deploy note below.
- **The live site looks stale after a merge:** check the **Deploys** tab —
  if the latest commit's deploy shows "failed" or is still "building", the
  previous successful deploy stays live until a new one finishes. Also check
  that the commit actually touched `docs/` or `netlify.toml`; the `ignore`
  rule in `netlify.toml` intentionally skips deploys for commits that don't.
- **A deploy succeeded but the change isn't visible:** browsers can cache
  HTML; HTML responses are left at Netlify's default (revalidating) cache
  policy specifically so this doesn't linger — a normal reload should pick up
  the new deploy. Static assets under `/_nuxt/*` are fingerprinted and cached
  for a year, so they never need a cache-bust.

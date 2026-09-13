<!--
Thanks for the PR. See CONTRIBUTING.md for setup, the test commands and the
house rules. Delete any section that genuinely does not apply.
-->

## What

<!-- One or two sentences. What does this change do? -->

## Why

<!-- The problem, the bug, the issue number. Fixes #… -->

## How it was verified

<!-- The commands you actually ran, and anything you exercised by hand. -->

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npx vitest run --config vitest.integration.config.ts`
- [ ] `npm run test:e2e`
- [ ] Tried it in the running app

## Checklist

- [ ] One concern; branched off `main`
- [ ] Commit messages follow Conventional Commits (`feat(scope): …`)
- [ ] Behaviour change comes with a test
- [ ] Docs under `docs/content/` updated (endpoint, default, env var or
      user-visible behaviour changed)
- [ ] Schema change has a generated migration committed under
      `server/db/migrations/` (`npm run db:generate`)
- [ ] Vue components use `<script setup lang="ts">`; colours via semantic
      tokens only (no hard-coded hex); `.tnum` on time and money figures
- [ ] No new dependency, or the PR says why it earns its place

## Screenshots

<!-- Before / after for anything visual. -->

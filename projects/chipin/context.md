# ChipIn frontend context

Repository: `ChipIn-one/chipin-frontend`

Scope: frontend only.

Integration branch: `dev`
Release branch: `main`

Normal development: `task/*` → `dev`

Release: `dev` → `main`

Luna may:

- create task branches;
- stage task-owned files;
- commit;
- push;
- open or update PRs.

Luna never merges.

Full local completion gate: `npm run verify:full`

GitHub Actions `frontend-ci` is the authoritative deterministic PR gate.
Vercel is a preview/deployment signal, not a replacement for `frontend-ci`.

Relevant frontend repository rules: `AGENTS.md`, `docs/codex/`.

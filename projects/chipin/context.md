# ChipIn frontend context

Repository: `ChipIn-one/chipin-frontend`

Scope: frontend only.

Integration branch: `dev`
Release branch: `main`
Repository default branch: `main`

Normal task PR base: `dev`; do not infer it from the repository default branch.

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

Tracked Husky `pre-push` repeats `npm run verify:full` and blocks a non-zero
result.

GitHub Actions `frontend-ci` is the authoritative deterministic PR gate.
For integration readiness, a task branch must have a PR into `dev` with required
`frontend-ci` green; local green is not sufficient.

Luna never pushes directly to `dev`/`main` and never merges; human performs the
merge.

Vercel is a preview/deployment signal, not a replacement for `frontend-ci`.

Relevant frontend repository rules: `AGENTS.md`, `docs/codex/`.

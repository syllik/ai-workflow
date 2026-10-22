# ChipIn frontend context

Repository: `ChipIn-one/chipin-frontend`

Scope: frontend only.

Integration branch: `master` (since 2026-10-22, ChipIn-one/chipin-frontend#497)
Repository default branch: `master` (the only long-lived branch; squash-only)

Normal task PR base: `master`.

Normal development: `<type>/issue-<number>-<slug>` → `master` (squash merge)

Release: the owner promotes the exact tested `master` commit's Vercel
deployment to Production; there is no release branch. `dev` and `main` are
frozen rollback refs only, until 2026-11-05.

The orchestrator holding the Trusted Publisher capability may:

- create task branches;
- stage task-owned files;
- commit;
- push;
- open or update PRs.

No agent merges.

Full local completion gate: `npm run verify:full`

Tracked Husky `pre-push` repeats `npm run verify:full` and blocks a non-zero
result.

GitHub Actions `frontend-ci` is the authoritative deterministic PR gate.
For integration readiness, a task branch must have a PR into `master` with required
`frontend-ci` green; local green is not sufficient.

No agent pushes directly to `master` or merges; human performs the merge.

Vercel is a preview/deployment signal, not a replacement for `frontend-ci`.

Relevant frontend repository rules: `AGENTS.md`, `docs/engineering/`.

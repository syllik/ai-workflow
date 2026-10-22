# ChipIn frontend decisions

* Since 2026-10-22 (ChipIn-one/chipin-frontend#497, cutover PR #502),
  `master` is the default, integration and only long-lived branch; merges are
  squash-only. This supersedes the former `dev` integration / `main` release
  topology; `dev` and `main` are frozen rollback refs until 2026-11-05.
* Normal work is `<type>/issue-<number>-<slug>` → `master`; production release
  is the owner's Vercel "Promote to Production" of an exact tested `master`
  commit.
* Human performs all merges; auto-merge is disabled.
* No subagents. Luna implements and reviews task-owned changes according to the
  canonical bounded review workflow.
* Copilot Code Review is not part of the required/default workflow.
* Deterministic CI is the merge gate.
* Luna may stage task-owned files, commit, push task branches, and create/update
  PRs.
* The local completion gate is `npm run verify:full`; tracked Husky `pre-push`
  repeats it and blocks non-zero results.
* Required remote `frontend-ci` must be green on the PR into `master` before
  reporting readiness for integration; local green is not sufficient for remote
  readiness.
* Vercel is a preview/deployment signal, not a replacement for `frontend-ci`.
* Luna never pushes directly to `master`; human performs merges and
  production promotion.
* Dependabot updates target the default branch `master`.
* Backend is outside the frontend agent workflow scope.

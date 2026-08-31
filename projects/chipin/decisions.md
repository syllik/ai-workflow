# ChipIn frontend decisions

* `dev` is the permanent integration branch; `main` is the release branch.
* The frontend repository default branch is `main`, but normal task PRs must
  explicitly target integration branch `dev`.
* Normal work is `task/*` → `dev`; normal release is `dev` → `main`.
* Human performs all merges; auto-merge is disabled.
* No subagents. Luna implements and reviews task-owned changes according to the
  canonical bounded review workflow.
* Copilot Code Review is not part of the required/default workflow.
* Deterministic CI is the merge gate.
* Luna may stage task-owned files, commit, push task branches, and create/update
  PRs.
* The local completion gate is `npm run verify:full`; tracked Husky `pre-push`
  repeats it and blocks non-zero results.
* Required remote `frontend-ci` must be green on the PR into `dev` before
  reporting readiness for integration; local green is not sufficient for remote
  readiness.
* Vercel is a preview/deployment signal, not a replacement for `frontend-ci`.
* Luna never pushes directly to `dev`/`main`; human performs integration and
  release merges.
* Normal Dependabot version updates target `dev`.
* Dependabot security updates may still target the default branch `main` and
  must be handled intentionally.
* Backend is outside the frontend agent workflow scope.

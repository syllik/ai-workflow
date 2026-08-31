# ChipIn frontend decisions

- `dev` is the permanent integration branch; `main` is the release branch.
- The frontend repository default branch is `main`, but normal task PRs must
  explicitly target integration branch `dev`.
- Normal work is `task/*` → `dev`; normal release is `dev` → `main`.
- The user always performs merges; auto-merge is disabled.
- No subagents. Luna implements and performs one bounded self-review.
- Copilot Code Review is not part of the required/default workflow.
- Deterministic CI is the merge gate.
- Luna may stage task-owned files, commit, push, and create/update PRs.
- The local completion gate is `npm run verify:full`; tracked Husky `pre-push`
  repeats it and blocks non-zero results.
- Remote `frontend-ci` must be green on the PR into `dev` before reporting
  readiness for integration; local green is not authoritative for merge.
- Luna never pushes directly to `dev`/`main`; only a human merges integration
  branches.
- Normal Dependabot version updates target `dev`.
- Dependabot security updates may still target the default branch `main` and must be handled intentionally.
- Backend is outside the frontend agent workflow scope.

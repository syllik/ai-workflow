# ChipIn frontend decisions

- `dev` is the permanent integration branch; `main` is the release branch.
- Normal work is `task/*` → `dev`; normal release is `dev` → `main`.
- The user always performs merges; auto-merge is disabled.
- No subagents. Luna implements and performs one bounded self-review.
- Copilot Code Review is not part of the required/default workflow.
- Deterministic CI is the merge gate.
- Luna may stage task-owned files, commit, push, and create/update PRs.
- Normal Dependabot version updates target `dev`.
- Dependabot security updates may still target the default branch `main` and must be handled intentionally.
- Backend is outside the frontend agent workflow scope.

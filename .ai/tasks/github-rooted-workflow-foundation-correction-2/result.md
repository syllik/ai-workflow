# GitHub-rooted workflow foundation correction 2 result

## Outcome

Removed the five verified Phase 1A blockers in the existing
`task/github-rooted-agent-architecture` branch and PR #4.

- Managed context scaffolding is template-shaped and create-if-missing; regular populated context is preserved exactly and budgeted.
- Profile and target routing uses canonical absolute GitHub `HEAD` URLs.
- One CLI `workspace apply` converges missing managed repositories in a bounded clone/scaffold/re-plan flow; read-only clones receive no writes.
- Budget inspection is limited to known central and managed artifacts, including human-only `plan.md`; symlinks, non-files, read-only repositories, and unrelated trees are skipped.
- README, AGENTS, and the reusable Luna prompt state that users review `plan.md` and Luna never reads it. Correction 1 state/result are marked superseded without rewriting historical claims.

## Validation

- `npm test`: 41 tests passed.
- `npm run verify`: passed, including manifest-only check, generated check, and `git diff --check`.
- Focused fixture tests cover context preservation, canonical routes, one-apply convergence, read-only cloning, bounded artifact inspection, and plan-reading instructions.
- No real canonical workspace apply or backend write ran.

## Publication

- Pushed only `task/github-rooted-agent-architecture`.
- Updated existing PR [#4](https://github.com/syllik/ai-workflow/pull/4) only; it remains open, non-draft, and targets `master`.
- PR head and branch ref were verified after push; no configured remote checks are present.
- No merge, auto-merge, force-push, branch creation, or direct push to `master` was performed.

Status: `READY_FOR_HUMAN_MERGE`.

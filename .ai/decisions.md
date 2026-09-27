# Foundation decisions

- `workspace.yaml` is the canonical GitHub-rooted project manifest.
- `AI.md` is the profile entry and `FLOW.md` is the compact route; role files and target repository context are lazy-loaded.
- `read-only` records cannot receive context writes or generated updates.
- Hard byte budgets are measured in UTF-8 bytes and violations are blocking.
- Managed edits are deterministic, LF-only, idempotent, and limited to valid `ai-workflow` markers.
- Canonical apply is supported after normal safety checks; Phase 1A used isolated fixtures and did not execute it against `~/Desktop/WORK`.
- Managed Codex GitHub Code Review is the routine reviewer, with automatic PR review disabled. Opening a PR, marking it Ready, or pushing a new head does not start review. The only routine trigger is an explicit `@codex review` comment after the repository-defined full CI gate for the current head is complete and green; do not trigger while CI is pending/failing or duplicate a review already running/current for that head. A head change invalidates prior CI/review evidence and requires fresh full green CI followed by a new `@codex review` comment. Codex is reviewer-only; findings reach Luna only after explicit human authorization, Sol 5.6 High is escalation/fallback only, and only a human merges.
- Each workspace record declares an explicit `integrationBranch`; active managed context is resolved on that branch, while onboarding records do not advertise context as ready for normal execution.
- Project `contextDependencies` are explicit read-only context sources; they are never workspace write targets or auto-discovery seeds, and unavailable required dependency context blocks work.
- The profile `AI.md` bootstrap is a managed generated block owned by workspace convergence.
- Human-approved ChipIn authority decision: task identity is `owner/repository#issue`; GitHub Issues own specification and dependencies, Organization Issue Fields own structured metadata, and ChipIn Development Project #5 Status owns workflow state. Trello is historical/read-only only with no bidirectional synchronization. Issue or Project state is not execution authorization; every execution requires explicit human approval provenance retained in the task prompt/checkpoint.

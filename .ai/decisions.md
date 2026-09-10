# Foundation decisions

- `workspace.yaml` is the canonical GitHub-rooted project manifest.
- `AI.md` is the profile entry and `FLOW.md` is the compact route; role files and target repository context are lazy-loaded.
- `read-only` records cannot receive context writes or generated updates.
- Hard byte budgets are measured in UTF-8 bytes and violations are blocking.
- Managed edits are deterministic, LF-only, idempotent, and limited to valid `ai-workflow` markers.
- Canonical apply is supported after normal safety checks; Phase 1A used isolated fixtures and did not execute it against `~/Desktop/WORK`.
- Managed Codex GitHub Code Review uses automatic review on every push to an open PR as the routine default; `@codex review` is the manual fallback/retrigger, and only a review of the current PR head is valid.
- Each workspace record declares an explicit `integrationBranch`; active managed context is resolved on that branch, while onboarding records do not advertise context as ready for normal execution.
- Project `contextDependencies` are explicit read-only context sources; they are never workspace write targets or auto-discovery seeds, and unavailable required dependency context blocks work.
- The profile `AI.md` bootstrap is a managed generated block owned by workspace convergence.
- Human-approved ChipIn authority decision: task identity is `owner/repository#issue`; GitHub Issues own specification and dependencies, Organization Issue Fields own structured metadata, and ChipIn Development Project #5 Status owns workflow state. Trello is historical/read-only only with no bidirectional synchronization. Issue or Project state is not execution authorization; every execution requires explicit human approval provenance retained in the task prompt/checkpoint.

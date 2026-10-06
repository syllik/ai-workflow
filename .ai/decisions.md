# Foundation decisions

- `workspace.yaml` is the canonical GitHub-rooted project manifest.
- `AI.md` is the profile entry and `FLOW.md` is the compact route; role files and target repository context are lazy-loaded.
- `read-only` records cannot receive context writes or generated updates.
- Hard byte budgets are measured in UTF-8 bytes and violations are blocking.
- Managed edits are deterministic, LF-only, idempotent, and limited to valid `ai-workflow` markers.
- Canonical apply is supported after normal safety checks; Phase 1A used isolated fixtures and did not execute it against `~/Desktop/WORK`.
- Task-policy contract v2 separates provider-independent Planner, Architect, Executor, Reviewer, and Auditor roles from a separate Trusted Publisher. Model/runtime capability is selected by risk rather than role name. Upfront v2 approval carries allowed paths, publication permission, and 0–2 correction batches. Legacy v1/unspecified handoffs remain valid under their prior human gates and gain no implicit publication/correction authority. Publication is one final commit plus one push per completed revision without history rewrite; current-head green CI precedes one independent read-only review per SHA with consolidated findings; changed head stales prior CI/review; exhausted correction budget escalates to a human; only a human merges.
- Each workspace record declares an explicit `integrationBranch`; active managed context is resolved on that branch, while onboarding records do not advertise context as ready for normal execution.
- Project `contextDependencies` are explicit read-only context sources; they are never workspace write targets or auto-discovery seeds, and unavailable required dependency context blocks work.
- The profile `AI.md` bootstrap is a managed generated block owned by workspace convergence.
- Human-approved ChipIn authority decision: task identity is `owner/repository#issue`; GitHub Issues own specification and dependencies, Organization Issue Fields own structured metadata, and ChipIn Development Project #5 Status owns workflow state. Trello is historical/read-only only with no bidirectional synchronization. Issue or Project state is not execution authorization; every execution requires explicit human approval provenance retained in the task prompt/checkpoint.
- Audited Git lifecycle policy: `master` is the canonical long-lived source, normal feature/fix PRs use squash merge, deployment profiles are `none|staging|production`, production promotion targets an exact tested commit/tag, and any temporary non-`master` integration topology must be explicitly recorded in `workspace.yaml` with a bounded follow-up. Policy changes do not rename or delete branches; human merge remains final.

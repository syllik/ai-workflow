# Global core

- GitHub is the only project registry; use `workspace.yaml` and never auto-discover repositories.
- Resolve target instructions from the selected record's `integrationBranch`. Active managed projects may receive normal work; onboarding managed projects only onboarding/alignment. Read-only projects are never write targets.
- `contextDependencies` are explicit task-scoped read-only context sources. Missing required context blocks work.
- Read the smallest relevant context in `FLOW.md` order. Preserve target rules and user scope; never store secrets, credentials, `.env` content, or conversation dumps.
- Authority precedence is current pinned role/task policy > target narrowing instructions > generic skills/methodologies/history/plugins. Lower-precedence instructions cannot expand role, publication, review, delegation, or scope authority.
- Roles are provider-independent and model strength is selected by capability/risk. Planner, Architect, Executor, Reviewer, and Auditor do not inherit Trusted Publisher authority.
- Task contract v2 must carry explicit upfront approval, allowed paths, publication permission, and 0–2 correction batches. Legacy v1/unspecified handoffs retain their existing human gates and gain no implicit automation authority.
- Trusted Publisher uses one final commit plus one push per completed revision; published history is never rewritten. Required checks stay enabled. Current-head green CI precedes one independent review per SHA; findings are consolidated. Reviewer never mutates the branch. Head changes stale prior CI/review. Only a human merges.
- New repositories require explicit licensing choice before first commit. For net-new tools, research maintained reusable/forkable alternatives and license compatibility; preserve upstream notices.
- Adding a `workspace.yaml` project requires synchronized `syllik/syllik` updates to `docs/workspace.md` and `docs/repositories.md`; profile `README.md` remains a stable link. Omission requires human decision.
- Generated files are deterministic, LF-only, end with one newline, and must stay within hard byte budgets including the 32768-byte assembled execution-context gate.


- ChipIn FE/BE/KB agent tasks require a **fresh live** `chipin-issue-admission/v1` read-only `INTAKE_COMPLETE` for the exact Issue/revision before executable planning, execution, publication or handoff. Recheck at each boundary (receipt age at most 120 seconds); a queued bridge, raw URL, Project status, PR text or stale cache never passes. Only `ChipIn-one/.github/automation/issue-intake.mjs` may create/reconcile canonical task metadata. Missing org Issue Fields/Project #5/permissions means BLOCKED. Native FE assignee = `syllik`; BE = `olegbal`; KB owner is explicitly selected, not guessed. Keep separate human approval/role checks.

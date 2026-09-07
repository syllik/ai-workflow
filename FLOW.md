# Canonical workflow

GitHub is the only project registry. Read:
`AI.md -> FLOW.md -> workspace record -> role rules -> target AGENTS.md/.ai/context.md -> relevant decisions/task files`.
Read only the selected project. Do not auto-discover repositories. Target repositories own invariants; task prompts own scope/validation.

New project/repository licensing is a pre-first-commit gate, including private repositories: Sol asks the human, explains choices, and bootstraps the selected license/rights notice. Before a net-new tool, research current analogues; prefer viable reuse/fork over greenfield and preserve upstream license obligations.

Adding a project to `workspace.yaml` requires a coordinated `syllik/syllik` change for `docs/workspace.md` and `docs/repositories.md`. It is not ready for human merge until synchronized. Profile `README.md` keeps a stable link to `docs/workspace.md`; omission requires explicit human approval.

Sol hands Luna one self-contained prompt. Luna is executor-only: implement scope, run validation, checkpoint state, then stop at `IMPLEMENTATION_COMPLETE` or `BLOCKED`. Luna does not self-review, use subagents, commit, push, publish/update PRs, or mutate publication state.

After validation, trusted Sol/human publication creates or updates the PR. Routine review uses managed Codex GitHub Code Review. Trigger `@codex review` manually; automatic review is disabled by default. A review is current only when its reviewed commit SHA matches the current PR head. Codex is reviewer-only: never use `@codex fix` or branch-mutation commands. Findings reach Luna only after explicit human authorization as one consolidated package. Any changed head requires a new `@codex review`. Sol 5.6 High is reserved for escalation or fallback: architecture/high-risk review, ambiguous/disputed findings, Codex unavailability, or explicit human request. Only a human merges.

Use persisted state for long/audit-significant work. Never store secrets or credentials.

## Task publication contract

When an agent creates or normalizes a human-facing task in an external tracker, keep one canonical task contract and do not encode the same state in multiple places.

- Status belongs to the tracker's workflow state/list, not the description.
- Priority belongs to exactly one priority field/label. Presentation emoji may be derived from priority but is never independent state.
- Scope/area belong to explicit fields/labels when the tracker supports them.
- The title is a compact human-readable rendering of canonical metadata plus the semantic task name. Do not use bracket-prefix syntax such as `[PRE-PROD] [FE][P0]`.
- The description contains only durable execution context using `Problem -> Outcome -> Acceptance -> Dependencies -> References` when those sections are relevant.
- Do not add `[TASK DESCRIPTION]`, generic agent instructions, mutable status/history, execution journals, raw verification logs, or duplicated tracker metadata to the canonical description.
- Put transient execution evidence in comments/activity or the publication/result channel unless it is required as a durable reference.
- Notifications render from the same canonical fields and should trigger only for meaningful state changes; they must not invent independent priority/status semantics.
- Project/repository rules may narrow this contract for a specific tracker or team. Do not mutate another team's tracker flow unless that project's rules explicitly authorize it.

### Temporary project profile: ChipIn frontend

Until `ChipIn-one/chipin-frontend/AGENTS.md` is synchronized, apply this profile to Trello publication for frontend tasks only:

- Never normalize or mutate backend-team cards or backend notification flow without explicit authorization.
- Area is the `Frontend` label.
- Priority is exactly one of `P0`, `P1`, `P2`, `P3`; do not use frontend legacy `Critical`, `Major`, `Minor`, generic `Priority`, or `PROD CRIT`.
- Render priority as `P0 -> 🔴`, `P1 -> 🟠`, `P2 -> 🟡`, `P3 -> ⚪`.
- Until PRE-PROD has its own canonical field/label, render PRE-PROD FE titles as `<emoji> <P#> · PRE-PROD · FE · <semantic task name>`.
- Trello list is authoritative for Todo/In progress/DEV/PROD/Done. A blocker belongs in `Dependencies`; do not create a second status system in title/description.
- Canonical description sections are only the relevant subset of `Problem`, `Outcome`, `Acceptance`, `Dependencies`, `References`.
- Slack/Trello notifications are presentation only and derive meaning from the same task fields/title.
- Remove this temporary profile after the target repository contains equivalent rules.


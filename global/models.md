# Model tiers

Roles reference capability tiers, not model names. A model name never grants a role or authority. Subagents stay within the parent session's provider. Pick the cheapest tier that fits the task; escalate one tier only after the lower tier visibly failed, and say so in the report.

- `frontier` — only on the owner's explicit request: a new product spec, a hard audit or synthesis. Never orchestrates or executes.
- `deep` — architecture and spec review, high-risk review (money, auth, security, data loss), debugging after a `standard` attempt failed.
- `standard` — Executor, normal review, orchestrator of a plan that still needs decisions.
- `routine` — orchestrator of an approved plan, GitHub/Issues/Projects bookkeeping in the session, reports, docs and copy edits, mechanical edits from an exact spec.
- `fast` — search, reading, running tests, summarizing logs; never writes code.

Session defaults: a new session starts on `standard`. The orchestrator is `routine` once the plan is approved, `standard` otherwise, never `deep` or `frontier`. A `frontier` session ends with a handoff to a `routine` or `standard` orchestrator.

Effort: `medium` by default; `high` only for `deep`; `low` for `fast`; higher levels only on the owner's request.

Subagent calls always set the tier explicitly; a subagent never inherits a `frontier` parent.

## Provider mapping

Add a provider row when it is first used. A session whose provider has no row uses no subagents until the row is added.

| Provider | `frontier` | `deep` | `standard` | `routine` | `fast` | Fallback when `fast` is insufficient |
| --- | --- | --- | --- | --- | --- | --- |
| Anthropic | Fable 5.1, medium effort | Opus 5.5, high effort | Opus 5.5, medium effort | Sonnet 5.5, medium effort | Haiku 5.5, low effort | Sonnet 5.5 |

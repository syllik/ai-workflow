# Model tiers

Roles reference capability tiers, not model names. A model name never grants a role or authority. Subagents stay within the parent session's provider. Pick the cheapest tier that fits the task; escalate one tier only after the lower tier visibly failed, and say so in the report.

- `frontier` — only on the owner's explicit request: a new product spec, a hard audit or synthesis. Never orchestrates or executes; may use read-only `fast` subagents.
- `deep` — architecture and spec review, high-risk review (money, auth, security, data loss), debugging after a `standard` attempt failed.
- `standard` — Executor, normal review, orchestrator of a plan that still needs decisions.
- `routine` — orchestrator of an approved plan, reports, docs and copy edits, mechanical edits from an exact spec. Tiers grant no authority: GitHub/Issues/Projects mutations stay with the roles and task authority defined in `global/core.md` and `global/publisher.md`, never with a subagent.
- `fast` — search, reading, running tests, summarizing logs; never writes code.

Session defaults: a new session starts on `standard`. The orchestrator is `routine` once the plan is approved, `standard` otherwise, never `deep` or `frontier`; the switch happens through a handoff to a new session, not mid-session. Architecture review the orchestrator needs goes to a read-only `deep` subagent or a separate session. A `frontier` session ends with a handoff to a `routine` or `standard` orchestrator. Session rotation by context size is triggered by the DDF context-budget rule ([`docs/orchestrator/handoff.md#context-budget`](https://github.com/syllik/deep-dark-factory/blob/HEAD/docs/orchestrator/handoff.md#context-budget)): at the soft limit hand off at the next checkpoint, at the hard limit finish the current step, hand off and stop.

Effort: `medium` by default; `high` only for `deep`; `low` for `fast`; higher levels only on the owner's request.

Subagent calls always set the tier explicitly; a subagent never inherits a `frontier` parent. When `fast` is insufficient, escalate to `routine`.

## Provider mapping

Add a provider row when it is first used. A session whose provider has no row uses no subagents until the row is added.

| Provider | `frontier` | `deep` | `standard` | `routine` | `fast` |
| --- | --- | --- | --- | --- | --- |
| Anthropic | Fable 5.1, medium effort | Opus 5.5, high effort | Opus 5.5, medium effort | Sonnet 5.5, medium effort | Haiku 5.5, low effort |

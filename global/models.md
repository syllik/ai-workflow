# Model tiers

Roles reference capability tiers, not model names. A model name never grants a role or authority. Subagents stay within the parent session's provider.

- `deep` — orchestrator, architecture, high-risk review.
- `standard` — Executor, normal review.
- `fast` — search, reading, mechanical work, running tests, summarizing logs; never writes code.

## Provider mapping

Add a provider row when it is first used. A session whose provider has no row uses no subagents until the row is added.

| Provider | `deep` | `standard` | `fast` | Fallback when `fast` is insufficient |
| --- | --- | --- | --- | --- |
| Anthropic | Opus 5.5, high effort | Opus 5.5, medium effort | Haiku 5.5 | Sonnet 5.5 |

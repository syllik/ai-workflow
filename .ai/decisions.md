# Foundation decisions

- `workspace.yaml` is the canonical GitHub-rooted project manifest.
- `AI.md` is the profile entry and `FLOW.md` is the compact route; role files and target repository context are lazy-loaded.
- `read-only` records cannot receive context writes or generated updates.
- Hard byte budgets are measured in UTF-8 bytes and violations are blocking.
- Managed edits are deterministic, LF-only, idempotent, and limited to valid `ai-workflow` markers.
- Canonical apply is supported after normal safety checks; Phase 1A used isolated fixtures and did not execute it against `~/Desktop/WORK`.

# Superseded Phase 1A result

This result is superseded by `.ai/tasks/github-rooted-workflow-foundation-correction/`.

## Outcome

Implemented the GitHub-rooted workflow foundation in `syllik/ai-workflow`.

- Added the exact Node `22.23.2` ESM package contract and locked `yaml` `2.9.0` dependency.
- Added strict `workspace.yaml` schema validation for the original eight project records, exclusions, access/status combinations, safe paths, and hard UTF-8 budgets.
- Added deterministic renderers, managed markers, isolated fixture-tested clone/create/managed-block operations, and strict CLI commands with exit codes 0/1/2.
- Added the `AI.md` → `FLOW.md` → manifest → role → target context route, global role files, local `.ai` contract, compatibility pointers, generated index, README updates, and AGENTS routing block.
- Preserved legacy central project contexts as migration-only and kept the backend read-only.

## Validation

- `npm test`: 26 tests passed.
- `node scripts/workspace/cli.mjs check --manifest-only`: passed.
- `npm run verify`: passed, including generated-drift validation and `git diff --check`.
- Real `apply` against `~/Desktop/WORK` was not run; the correction task removes the permanent product block while retaining the execution boundary for this task.
- Full task-owned diff review completed in five batches plus the cross-file routing pass with no findings.

## Publication

- Implementation commit: `69920bb80570d4cbb5a3a33c5fdea6dec159bd6c`.
- Pushed only `task/github-rooted-agent-architecture` to `origin`.
- PR [#4](https://github.com/syllik/ai-workflow/pull/4) is open into `master`, non-draft, `CLEAN`; no remote checks are configured for this branch.

Status: `SUPERSEDED_BY_CORRECTION`.

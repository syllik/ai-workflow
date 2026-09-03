# Luna execution prompt

## Task

Implement Phase 1A of the approved GitHub-rooted agent architecture in `syllik/ai-workflow`.

## Repository contract

- Repository: `syllik/ai-workflow`
- Base branch: `master`
- Approved base SHA: `1c2d4831ff84aea7a4d63135dc2c2ff4952e4c46`
- Authorized task branch: `task/github-rooted-agent-architecture`
- PR target: `master`
- Persistence mode: `persisted`
- State: `.ai/tasks/github-rooted-workflow-foundation/state.md`
Do not load either human-only `plan.md`; this prompt is self-contained. Fetch and continue the existing remote task branch without rewriting its history.

## Goal

Create the workflow foundation only: a canonical workspace manifest, deterministic context budgets, a safe Node.js workspace validator/generator, compact GitHub-only routing, and the local `.ai` contract for this repository.

Do not modify any other repository in this phase.

## Required implementation

### Runtime

Add an ESM Node.js package using exactly Node `22.23.2`, built-in `node:test`, and an exact locked `yaml` runtime dependency. Provide:

```text
npm test
npm run verify
node scripts/workspace/cli.mjs check [--root <path>] [--manifest-only]
node scripts/workspace/cli.mjs plan --root <path>
node scripts/workspace/cli.mjs apply --root <path>
```

### Manifest

Create `workspace.yaml` with schema version, canonical root `~/Desktop/WORK`, byte budgets, and exactly these projects:

```text
syllik/syllik                         managed  onboarding  profile/syllik
ChipIn-one/chipin-frontend            managed  onboarding  products/chipin/chipin-frontend
ChipIn-one/chipin-backend             read-only active      products/chipin/chipin-backend
syllik/chatgpt-archive-cleanup        managed  onboarding  tools/ai/chatgpt-archive-cleanup
syllik/codex-local-runner             managed  onboarding  tools/ai/codex-local-runner
syllik/youtube-metadata-translator    managed  onboarding  tools/content/youtube-metadata-translator
syllik/ai-workflow                    managed  active      workflows/ai/ai-workflow
syllik/gpg-signed-commits             managed  onboarding  guides/git/gpg-signed-commits
```

Records contain `id`, `repository`, `localPath`, `group`, `access`, `status`, and managed-only `contextPath: .ai/context.md`. Reject unknown keys, duplicates, unsafe/non-POSIX paths, invalid combinations, managed-active without context, and read-only with context. Exclude Tangem, `syllik.github.io`, and auto-discovery.

### Hard budgets

Implement deterministic UTF-8 byte checks:

```text
AI.md                     1024
FLOW.md                   2048
global role file          6144
managed AGENTS block      1024
.ai/context.md            8192
one decision record       4096
prompt.md                 8192
state.md                  2048
result.md                 4096
human plan.md            16384
```

A budget violation is blocking. Return stable findings containing code, path, actual bytes, and maximum bytes.

### Modules

Create focused modules:

- `scripts/workspace/manifest.mjs`: `loadManifest(path)`, `validateManifest(value)`.
- `scripts/workspace/budgets.mjs`: `utf8Bytes(text)`, `checkBudget(input, budgets)`.
- `scripts/workspace/render.mjs`: pure project-index, profile-navigation, AGENTS-block, and managed-block renderers.
- `scripts/workspace/operations.mjs`: `planWorkspace(options)`, `applyOperations(options)`.
- `scripts/workspace/cli.mjs`: strict `check|plan|apply` command boundary.

Managed markers are:

```text
<!-- ai-workflow:<name>:start -->
<!-- ai-workflow:<name>:end -->
```

Rendering is deterministic/idempotent, LF-only, with one final newline. Missing markers may plan insertion; malformed or duplicate markers block.

### Safe operations

The only operation kinds are `clone`, `create-file`, and `replace-managed-block`.

Before mutation, prove root containment and recheck destination, Git root, origin, clean status, worktrees, and operation preconditions. Never plan/execute move, delete, reset, clean, stash, overwrite, force push, branch deletion, read-only writes, or replacement of populated context/decisions. Updates stay inside valid markers; first drift safe-stops.

Phase 1A must not run real `apply` against `~/Desktop/WORK`. Test plan/apply only with isolated fixtures.

CLI exit codes:

- `0`: success/no drift;
- `1`: validation failure or generated drift;
- `2`: blocked unsafe state.

### Routing and repository contract

Create compact English files:

- `global/core.md`: global invariants.
- `global/architect.md`: Sol lazy loading, risk classification, approval and handoff.
- `global/executor.md`: bounded Luna lifecycle.
- `.ai/context.md`: this repository's purpose, commands, `master` PR target, and `npm run verify` completion gate.
- `.ai/decisions.md`: durable foundation decisions.
- `projects/README.md`: old central project contexts are migration-only and outside the active reading path.

Keep `FLOW.md` within 2048 bytes and route: profile AI entry → FLOW → one manifest record → architect rules → target AGENTS/context → relevant decisions/files.

Update root `AGENTS.md` with one managed routing block while preserving useful repository-local rules. Make `global/context.md` and `global/workflow.md` short compatibility pointers; do not duplicate the new workflow. Update `README.md` and `.gitignore`.

Generate `projects/index.md` from the manifest. It must link to target `.ai/context.md`, expose access/status, and never route agents into legacy central contexts.

## Tests

Use test-first development. Add:

- `test/manifest.test.mjs`
- `test/budgets.test.mjs`
- `test/render.test.mjs`
- `test/operations.test.mjs`
- `test/cli.test.mjs`
- isolated fixtures under `test/fixtures/workspace/`

Cover all stated schema/budget failures, deterministic markers, clone/no-op, wrong remote, collisions, dirty/multi-worktree, path escape, read-only, populated context, idempotency, and CLI codes.

Do not access or mutate real sibling repositories from tests.

## Persistence and review

Update `.ai/tasks/github-rooted-workflow-foundation/state.md` only after:

1. repository reconnaissance;
2. manifest/budget core;
3. render/operations core;
4. routing migration;
5. final validation/review.

Replace stale state; do not append a journal or raw logs.

Review the complete task-owned diff in coherent batches:

1. schema and budgets;
2. render and managed markers;
3. filesystem/Git safety;
4. routing and reading order;
5. exclusions and persistence.

Finish with a cross-file pass over:

```text
workspace.yaml → CLI → generated index → FLOW.md → AGENTS.md
```

## Validation

The full gate is `npm run verify`. It must run tests, manifest-only validation, generated-drift validation, and `git diff --check`.

Also run explicitly:

```bash
npm test
node scripts/workspace/cli.mjs check --manifest-only
npm run verify
```

All must exit `0`. Do not claim validation that was not run.

## Failure policy

For a failed targeted/full check, perform one bounded diagnosis using the error, task-owned diff, and directly related files. Make at most one obvious task-local correction and rerun the failed check plus the full gate. If unclear or still failing, stop and report the exact blocker. No broad research, speculative retries, or subagents.

## Git publication

Create focused commits as implementation units. Stage task-owned files only. Push only `task/github-rooted-agent-architecture`. Open or update a PR into `master`. Check required remote CI if configured.

Never push directly to `master`, merge, enable auto-merge, delete branches, or force push.

Create `.ai/tasks/github-rooted-workflow-foundation/result.md` only after completion. Finalize state/result at `READY_FOR_HUMAN_MERGE`; GitHub PR remains authoritative after human merge.

## Definition of done

Tests and budgets pass; real workspace apply was not run; only this repository changed; legacy storage is preserved but unrouted; backend/exclusions cannot be write targets; full diff review passes; the authorized branch and PR into `master` are ready for human merge.

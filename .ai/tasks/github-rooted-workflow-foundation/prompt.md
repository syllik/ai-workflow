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
- Human-only files: both `plan.md` files under the architecture/foundation task directories. Do not load them; this prompt is self-contained.

The remote task branch already contains planning artifacts. Fetch and continue that branch. Preserve every pre-existing commit and unrelated file.

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

Create `workspace.yaml` with schema version, canonical root `~/Desktop/Work`, byte budgets, and exactly these projects:

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

Each record has stable `id`, `repository`, `localPath`, purpose-first `group`, `access`, `status`, and `contextPath: .ai/context.md` only for managed records.

Reject unknown keys, duplicates, absolute/traversing/non-POSIX paths, invalid access/status combinations, managed active records without context, and read-only records with context. Do not include Tangem, `syllik.github.io`, or auto-discovered repositories.

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

Rendering must be deterministic, idempotent, LF-only, and end with one newline. Missing markers may produce a planned insert. Malformed, unpaired, or duplicate markers are blocking.

### Safe operations

The only operation kinds are `clone`, `create-file`, and `replace-managed-block`.

Before every mutation, resolve the canonical root and target, prove target containment, and recheck the operation preconditions. Validate existing destination type, Git root, canonical origin, clean status, and worktree mapping.

Never plan or execute move, delete, reset, clean, stash, overwrite, force push, branch deletion, or writes to a read-only project. Never replace populated context/decisions. Update existing files only inside a valid managed marker pair. Safe-stop on the first drift.

Phase 1A must not run real `apply` against `~/Desktop/Work`. Test plan/apply only with isolated fixtures.

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

Rewrite `FLOW.md` to fit 2048 bytes and require this order: profile AI entry, FLOW, one matching manifest record, global architect rules, target AGENTS/context, then only relevant decisions/files.

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

Cover valid schema plus every rejection above; UTF-8 and exact/over budget boundaries; deterministic rendering and markers; missing clone; correct checkout no-op; wrong remote; non-repository collision; dirty checkout; extra worktree; path escape; read-only project; populated context; second-apply idempotency; and CLI exit codes.

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

The manifest and CLI are tested and deterministic; real workspace apply was not run; this repository is the only repository changed; budgets pass; legacy contexts are outside active routing but not deleted; backend and excluded repositories cannot become write targets; the complete diff is reviewed; the authorized branch is pushed; and a PR into `master` is ready for human merge.

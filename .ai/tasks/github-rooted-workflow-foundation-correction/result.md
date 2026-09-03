# GitHub-rooted workflow foundation correction result

## Outcome

Corrected Phase 1A in the existing `task/github-rooted-agent-architecture` branch and PR #4.

- `workspace.yaml` is the explicit extensible allowlist; validation remains strict for schema, duplicates, safe paths, combinations, exclusions, and context rules.
- CLI and workspace options resolve the manifest from the `ai-workflow` checkout by default; `--manifest` and `--root` remain independent.
- `plan` and `apply` route managed `AGENTS.md`, `.ai/context.md`, and `.ai/decisions.md` into each managed repository at `<root>/<localPath>`.
- Missing read-only repositories produce clone-only plans; present read-only repositories receive no writes. `ChipIn-one/chipin-backend` receives no `AGENTS.md` or `.ai` operations.
- Canonical apply is supported after normal safety checks, but no real canonical apply was executed.
- Project navigation uses absolute GitHub URLs; managed links target `.ai/context.md`, and read-only links identify the repository source of truth.
- Agent-executable workflow files are English, and stale handoff state is explicitly superseded.

## Validation

- `npm test`: 33 tests passed.
- `node scripts/workspace/cli.mjs check --manifest-only`: passed.
- `npm run verify`: passed.
- `git diff --check`: passed.
- Full correction diff review completed; no dependency or lockfile changes.

## Publication

- Pushed only `task/github-rooted-agent-architecture`.
- Updated existing PR [#4](https://github.com/syllik/ai-workflow/pull/4) only; it is open, non-draft, and targets `master`.
- Current branch/PR head is mutable and was verified from Git and GitHub; no remote checks are configured.

Status: `READY_FOR_HUMAN_MERGE`.

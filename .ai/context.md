# ai-workflow context

This repository is the canonical GitHub-rooted storage for AI workflow rules, durable project context, decisions, and bounded task prompts. GitHub repository records live in `workspace.yaml`; legacy central project contexts remain preserved for migration and are outside the active reading path.

Commands:

- `npm test` runs the built-in `node:test` suite.
- `npm run verify` runs tests, manifest-only validation, generated-drift validation, and `git diff --check`.
- `node scripts/workspace/cli.mjs check --manifest-only` validates the manifest only.
- `node scripts/workspace/cli.mjs check` validates generated routing and budgets.

The integration branch is `master`. Changes are published only through an authorized task branch and a pull request into `master`. `npm run verify` is the completion gate. Real workspace apply is not part of Phase 1A.

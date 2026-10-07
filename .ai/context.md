# ai-workflow context

This repository is the canonical GitHub-rooted storage for AI workflow rules, durable project context, decisions, and bounded task prompts. GitHub repository records live in `workspace.yaml`; legacy central project contexts remain preserved for migration and are outside the active reading path.

Commands:

- `npm test` runs the built-in `node:test` suite.
- `npm run verify` runs tests, manifest-only validation, generated-drift validation, and `git diff --check`.
- `node scripts/workspace/cli.mjs check --manifest-only` validates the manifest only.
- `node scripts/workspace/cli.mjs check` validates generated routing and budgets.
- `node scripts/workspace/context-producer.mjs < context-input.json` builds a task-scoped context manifest, loads selected source bytes from the declared local Git checkouts at exact `repository@revisionSha:path` via `repositoryRoots`, verifies any caller-supplied body matches those Git bytes, verifies required IDs occur in selected content, and derives exact UTF-8 byte provenance for the 32768-byte gate.

The integration branch is `master`. Current task-policy contract is v2: provider-independent roles plus a separate Trusted Publisher; legacy v1/unspecified handoffs retain human-gated publication/corrections. The exact 32768-byte assembled-context gate remains unchanged. Changes are published only through an authorized task branch and PR into `master`; `npm run verify` is the completion gate. Real canonical workspace apply remains subject to normal safety checks. Routing rollout is verification-only: it checks generated managed consumers plus explicitly required read-only context at exact Git SHAs and never publishes rules into consumers.

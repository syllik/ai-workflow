# Reviewer role

Managed Codex GitHub Code Review is the default independent reviewer for
published pull requests.

- Trigger routine review manually with `@codex review` after trusted publication;
  keep automatic review disabled by default to avoid duplicate runs.
- Accept a Codex review as current only when its reviewed commit SHA matches the
  current PR head.
- Treat Codex as reviewer-only. Do not use `@codex fix`,
  `@codex address that feedback`, or any other command that asks Codex to
  mutate the branch.
- Keep reviewer findings separate from Luna execution state and result files.
- Do not send findings back to Luna or start a correction cycle until a human
  explicitly authorizes it.
- After authorization, hand Luna one consolidated findings package as bounded
  correction input.
- After any correction changes the PR head, publish the new head and trigger a
  new `@codex review`; the previous review is stale.
- Use Sol 5.6 High only for escalation or fallback: architecture/high-risk
  review, ambiguous or disputed findings, Codex unavailability, or explicit
  human request.
- When Sol 5.6 High is used, review the exact pinned base/head diff and validation
  evidence without implementing fixes or mutating the branch.
- Publication remains a separate Sol/human step; only a human merges.

# Reviewer role

Managed Codex GitHub Code Review is the default independent reviewer for
published pull requests.

- Codex automatic PR review must be disabled for managed repositories.
- The only routine trigger is an explicit `@codex review` PR comment after the
  repository-defined full CI gate for the current head is complete and green.
- Never trigger review while CI is pending or failing, and never duplicate a
  review already running or current for the same head.
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
- After any correction changes the PR head, prior CI/review evidence is stale.
  Wait for fresh full green CI, then post a new `@codex review` comment.
- Use Sol 5.6 High only for escalation or fallback: architecture/high-risk
  review, ambiguous or disputed findings, Codex unavailability, or explicit
  human request.
- When Sol 5.6 High is used, review the exact pinned base/head diff and validation
  evidence without implementing fixes or mutating the branch.
- Publication remains a separate Sol/human step; only a human merges.

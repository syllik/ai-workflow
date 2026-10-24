# Reviewer role

Reviewer is independent and read-only. Provider/model is selected by capability and risk; no provider is mandatory by role name.

- Review exactly the complete authoritative pinned base/head diff for the Trusted Publisher receipt after every repository-defined required CI check recorded in the handoff for that published head is complete and green.
- Review initiation must be explicit after that green-CI gate. Managed integrations must not auto-trigger the sole review on PR creation, ready-for-review transitions, or pushes.
- Permit at most one review for a head SHA. Do not start a duplicate review already running or recorded for that SHA.
- Run in a separate session, never as a subagent of any session (its own subagents are the only allowed level); another provider is allowed. Reviewer may use up to 5 parallel read-only `fast`-tier subagents for reading and checks; Reviewer alone consolidates their output into the one findings package. Use a context independent from the Executor context. Review correctness, regressions, security/data risks, architecture constraints, acceptance, and validation evidence. Missing same-change docs, and missing semantic emoji on touched `##` headings in `guides` files, are acceptance findings, not deterministic style to ignore (`global/documentation.md`).
- Return one consolidated findings package with stable finding IDs, severity, evidence, and location. Do not drip findings across repeated reviewer loops.
- After a human-directed final correction review, only P0/P1 findings that demonstrate a violation of an explicit contract invariant, functional correctness, security/data integrity, or acceptance criteria are blocking. P2/advisory defensive-hardening findings do not start another correction loop unless a human explicitly promotes them.
- Reviewer must not mutate the branch, implement fixes, publish, change Issue/Project/deploy/settings state, or merge.
- A new head invalidates prior CI/review evidence and requires fresh green CI before a new review.
- Corrections are authorized by the task handoff, not by Reviewer. v2 may authorize up to two bounded correction batches upfront; legacy v1/unspecified handoffs still require human authorization for each correction batch.
- If findings are disputed or the correction budget is exhausted, consolidate the disagreement/evidence and escalate to a human. Only a human merges.

- For ChipIn FE/BE/KB Issue-backed review, require fresh positive native `INTAKE_COMPLETE` read-back bound to exact task identity/revision in addition to current-head CI and publisher provenance. Queued connector results or stale Issue evidence block initiation; Reviewer must not repair the Issue itself.

At ChipIn review initiation (and new-head review after an authorized correction), independently recheck the exact native Issue/full revision with the shared .github preflight or authenticated `consumeAdmissionArtifact()` route resolved by `scripts/workspace/chipin-admission-route.mjs`. Evidence must be originally <120s old and include current Project #5 read-back; a changed Project item/Status without Issue `updated_at` changes invalidates earlier evidence. Reject copied/stale receipts; never dispatch privileged Actions or mutate intake.

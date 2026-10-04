# Reviewer role

Reviewer is independent and read-only. Provider/model is selected by capability and risk; no provider is mandatory by role name.

- Review exactly the pinned base/head diff after the repository-defined required CI gate for that head is complete and green.
- Permit at most one review for a head SHA. Do not start a duplicate review already running or recorded for that SHA.
- Use a context independent from the Executor context. Review correctness, regressions, security/data risks, architecture constraints, acceptance, and validation evidence.
- Return one consolidated findings package with stable finding IDs, severity, evidence, and location. Do not drip findings across repeated reviewer loops.
- Reviewer must not mutate the branch, implement fixes, publish, change Issue/Project/deploy/settings state, or merge.
- A new head invalidates prior CI/review evidence and requires fresh green CI before a new review.
- Corrections are authorized by the task handoff, not by Reviewer. v2 may authorize up to two bounded correction batches upfront; legacy v1/unspecified handoffs still require human authorization for each correction batch.
- If findings are disputed or the correction budget is exhausted, consolidate the disagreement/evidence and escalate to a human. Only a human merges.

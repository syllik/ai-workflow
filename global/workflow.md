# Role index and compatibility

Use `FLOW.md` for the lifecycle and `global/core.md` for shared invariants. Load only the selected role:

- `global/planner.md` — bounded scope, acceptance, approvals, dependencies; read-only.
- `global/architect.md` — architecture/risk decisions when triggered; read-only.
- `global/executor.md` — implementation and validation; no publication or review authority.
- `global/reviewer.md` — one independent current-SHA review; no branch mutation.
- `global/auditor.md` — evidence, policy, risk, and cost audit; read-only.
- `global/publisher.md` — trusted publication boundary; not an AI role grant.

Role names never imply a provider or model. Select capabilities by risk; do not invoke a stronger model merely because a role exists.

Task contract v2 carries structured upfront authority. Handoffs without `contractVersion` (or with v1) are legacy-compatible: execution may continue under their existing valid approval/context provenance, but publication and each correction stay human-gated. They do not inherit v2 automatic correction authority.

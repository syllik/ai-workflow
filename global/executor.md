# Executor role

Luna runs the bounded lifecycle for the task prompt.

1. Verify branch, clean state, task files, and scope.
2. Write tests first, implement the smallest change, and run targeted checks.
3. Review the complete task-owned diff in coherent batches.
4. Run `npm run verify`, create focused commits, and push only the authorized task branch when permitted.
5. Open or update the PR and stop at `READY_FOR_HUMAN_MERGE`; never merge or enable auto-merge.

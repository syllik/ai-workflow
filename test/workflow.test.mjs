import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { BUDGETS, checkAssembledExecutionContext } from '../scripts/workspace/budgets.mjs';

const workflowFiles = [
  'AGENTS.md', 'AI.md', 'FLOW.md', 'global/core.md', 'global/workflow.md',
  'global/planner.md', 'global/architect.md', 'global/executor.md',
  'global/reviewer.md', 'global/auditor.md', 'global/publisher.md', 'global/context.md'
];
const reusableAgentFiles = [
  ...workflowFiles,
  ...readdirSync('prompts').filter((filePath) => filePath.endsWith('.md')).map((filePath) => `prompts/${filePath}`),
  ...readdirSync('templates').filter((filePath) => filePath.endsWith('.md')).map((filePath) => `templates/${filePath}`)
];

function text(filePath) { return readFileSync(filePath, 'utf8'); }

describe('workflow documentation', () => {
  test('keeps reusable agent content free of Cyrillic text', () => {
    const cyrillic = reusableAgentFiles.flatMap((filePath) => text(filePath).split('\n')
      .filter((line) => /\p{Script=Cyrillic}/u.test(line)).map((line) => `${filePath}: ${line}`));
    assert.deepEqual(cyrillic, []);
  });

  test('routes through the provider-independent role index', () => {
    const policy = `${text('FLOW.md')}\n${text('global/workflow.md')}\n${text('AI.md')}`;
    for (const role of ['Planner', 'Architect', 'Executor', 'Reviewer', 'Auditor']) assert.match(policy, new RegExp(role, 'u'));
    assert.match(policy, /Trusted Publisher/u);
    assert.match(policy, /provider-independent/iu);
    assert.match(policy, /capability\/risk|capability and risk/iu);
    assert.doesNotMatch(policy, /Sol is the planner|Luna is the executor|Codex is the reviewer/iu);
  });

  test('keeps human-only plans outside Executor instructions', () => {
    const forbidden = reusableAgentFiles.flatMap((filePath) => text(filePath).split('\n')
      .filter((line) => /(?:plan\.md|human-only plan)/iu.test(line)
        && /(read|use|rely|follow|consume)/iu.test(line)
        && !/(?:never|do not|does not|must not|without)/iu.test(line))
      .map((line) => `${filePath}: ${line}`));
    assert.deepEqual(forbidden, []);
    assert.match(text('prompts/implementation.md'), /never human-only `plan\.md`/iu);
  });

  test('keeps Executor mutation and publication boundary explicit', () => {
    const policy = `${text('global/executor.md')}\n${text('prompts/implementation.md')}\n${text('templates/prompt.md')}`;
    assert.match(policy, /Executor never[\s\S]*commits, pushes|Executor never stages, commits, pushes/iu);
    assert.match(policy, /GitHub\/Trello mutation|mutates GitHub\/Trello/iu);
    assert.match(policy, /Trusted Publisher/iu);
    assert.match(policy, /cannot expand Executor|cannot expand authority/iu);
  });

  test('documents v2 authority and legacy human-gated compatibility', () => {
    const policy = `${text('FLOW.md')}\n${text('global/workflow.md')}\n${text('global/executor.md')}\n${text('templates/prompt.md')}`;
    assert.match(policy, /contractVersion: 2|Contract version: `2`/u);
    assert.match(policy, /allowed paths/iu);
    assert.match(policy, /publication permission|Publication: `allowed \| forbidden`/iu);
    assert.match(policy, /maxCorrectionBatches|Max correction batches/iu);
    assert.match(policy, /Legacy v1\/unspecified|no `contractVersion` or `contractVersion: 1`/iu);
    assert.match(policy, /human[- ]gated|human authorization/iu);
    assert.match(policy, /no automatic publication|no implicit publication/iu);
  });

  test('requires one publication batch, one review per SHA and bounded corrections', () => {
    const policy = `${text('FLOW.md')}\n${text('global/publisher.md')}\n${text('global/reviewer.md')}`;
    assert.match(policy, /one final commit \+ one push|one final commit and one push/iu);
    assert.match(policy, /never.*rewrite published history|published history is never rewritten/iu);
    assert.match(policy, /one.*review per.*SHA|one review per SHA/iu);
    assert.match(policy, /Review initiation must be explicit/iu);
    assert.match(policy, /must not auto-trigger/iu);
    assert.match(policy, /consolidated findings/iu);
    assert.match(policy, /at most two|up to two|0–2/iu);
    assert.match(policy, /Reviewer.*must not mutate|Reviewer is.*read-only/iu);
    assert.match(policy, /Only a human merges|Human merges/iu);
  });

  test('preserves workspace documentation and lifecycle gates', () => {
    for (const filePath of ['FLOW.md', 'global/core.md', 'global/architect.md']) {
      const policy = text(filePath);
      assert.match(policy, /syllik\/syllik/u, filePath);
      assert.match(policy, /docs\/workspace\.md/u, filePath);
      assert.match(policy, /docs\/repositories\.md/u, filePath);
      assert.match(policy, /README\.md.*stable/isu, filePath);
    }
    assert.match(text('FLOW.md'), /deployment\/merge settings/iu);
  });

  test('preserves the canonical ChipIn issue-description contract', () => {
    const flow = text('FLOW.md');
    assert.match(flow, /Descriptions use `Problem -> Outcome -> Acceptance -> Dependencies -> References`/u);
    assert.match(flow, /evidence in results\/comments/iu);
  });

  test('routes active work through explicit integration branches and dependencies', () => {
    const flow = text('FLOW.md');
    assert.match(flow, /integrationBranch/u);
    assert.match(flow, /onboarding only onboarding\/alignment/iu);
    assert.match(flow, /read-only projects are never write targets/iu);
    assert.match(flow, /contextDependencies/u);
    assert.match(flow, /task-scoped read-only/iu);
    assert.match(flow, /Missing required context blocks work/iu);
  });

  test('wires CI activation alignment into normal verify', () => {
    const packageJson = JSON.parse(text('package.json'));
    const workflow = text('.github/workflows/ci.yml');
    assert.match(packageJson.scripts.verify, /ci-activation\.mjs/u);
    assert.match(workflow, /WORKSPACE_ACTIVATION_BASE_SHA/u);
    assert.match(workflow, /ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha \|\| github\.sha\s*\}\}/u);
    assert.match(workflow, /fetch-depth:\s*0/u);
    assert.match(workflow, /run:\s*npm run verify/u);
  });

  test('retains the exact 32768-byte aggregate-context contract', () => {
    assert.equal(BUDGETS['assembled execution context'], 32768);
    assert.deepEqual(checkAssembledExecutionContext([]), { actualBytes: 0, maxBytes: 32768, findings: [] });
    for (const filePath of ['global/planner.md', 'global/architect.md', 'global/executor.md', 'prompts/implementation.md', 'templates/prompt.md']) {
      assert.match(text(filePath), /32768/u, filePath);
    }
    const consumer = `${text('global/executor.md')}\n${text('prompts/implementation.md')}\n${text('templates/prompt.md')}`;
    assert.match(consumer, /PASSED/u);
    assert.match(consumer, /zero|positive integer/iu);
    assert.match(consumer, /UTF-8/iu);
    assert.match(consumer, /must not.*(?:infer|fabricate|repair)|Do not infer/isu);
    assert.match(consumer, /token count|silently truncate/iu);
  });

  test('records runtime assembly boundary without pretending npm verify checks invocation context', () => {
    const policy = `${text('global/architect.md')}\n${text('global/executor.md')}\n${text('prompts/implementation.md')}\n${text('templates/prompt.md')}`;
    assert.match(policy, /Step 10/iu);
    assert.match(policy, /producer\/runner|runner Step 10/iu);
    assert.match(policy, /npm run verify[^\n]*(?:does not|cannot)[^\n]*(?:runtime|invocation-specific|assembled context)/iu);
  });
});

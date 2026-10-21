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

  test('active bootstrap and reusable prompts avoid mandatory provider-to-role mapping', () => {
    const readme = text('README.md');
    const research = text('prompts/research.md');
    const calibration = text('prompts/youtube-zen-source-calibration.md');
    assert.doesNotMatch(readme, /\b(?:Sol|Luna)\b|GPT-5\.6|Luna xhigh/iu);
    assert.doesNotMatch(research, /GPT-\d|\b(?:Sol|Luna)\b/iu);
    assert.doesNotMatch(calibration, /GPT-\d|\b(?:Sol|Luna)\b/iu);
    assert.match(readme, /provider-independent/iu);
    const reviewGuide = readme.split('## Как проходит code review')[1]?.split('## Структура')[0];
    assert.ok(reviewGuide, 'README must document the independent review lifecycle');
    assert.doesNotMatch(reviewGuide, /codex/iu);
    assert.doesNotMatch(reviewGuide, /(?:Codex|@codex review).{0,120}(?:default|mandatory|required|единственн)|(?:default|mandatory|required|единственн).{0,120}(?:Codex|@codex review)/iu);
    assert.match(readme, /Merge выполняет только человек/u);
    assert.match(research, /Planner or Architect/u);
    assert.match(calibration, /provider-independent/iu);
    const context = text('.ai/context.md');
    assert.doesNotMatch(context, /codex/iu);
    assert.doesNotMatch(context, /Luna executor boundaries/iu);
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
    assert.match(workflow, /if: github\.event_name == 'push'/u);
    assert.match(workflow, /WORKSPACE_ACTIVATION_BASE_SHA:.*github\.event_name == 'push'/u);
  });

  test('keeps private activation credentials out of PR-head code', () => {
    const ci = text('.github/workflows/ci.yml');
    const trusted = text('.github/workflows/activation-trusted.yml');
    assert.match(ci, /if: github\.event_name == 'push'/u);
    assert.doesNotMatch(ci, /pull_request\.head\.repo\.full_name/u);
    assert.match(trusted, /pull_request_target/u);
    assert.match(trusted, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/u);
    assert.match(trusted, /persist-credentials: false/u);
    assert.match(trusted, /git show "\$\{PR_HEAD_SHA\}:workspace\.yaml" > workspace\.yaml/u);
    assert.match(trusted, /git show "\$\{PR_HEAD_SHA\}:projects\/index\.md" > projects\/index\.md/u);
    assert.match(trusted, /git show "\$\{PR_HEAD_SHA\}:AGENTS\.md" > AGENTS\.md/u);
    assert.match(trusted, /github\.event\.pull_request\.user\.login != 'dependabot\[bot\]'/u);
    assert.match(trusted, /\$PR_HEAD_SHA/u);
    assert.match(trusted, /npm run verify/u);
    assert.match(trusted, /permission-contents: read/u);
  });

  test('documents versioned aggregate-context policy', () => {
    assert.equal(BUDGETS['assembled execution context'], 32768);
    assert.deepEqual(checkAssembledExecutionContext([]), { actualBytes: 0, maxBytes: 32768, findings: [] });
    assert.equal(checkAssembledExecutionContext(['x'.repeat(40000)], { enforceLimit: false }).maxBytes, null);
    for (const filePath of ['FLOW.md', 'global/core.md', 'global/planner.md', 'global/architect.md', 'global/executor.md', '.ai/context.md']) {
      assert.match(text(filePath), /32768/u, filePath);
    }
    const consumer = `${text('global/architect.md')}\n${text('global/executor.md')}\n${text('.ai/context.md')}`;
    assert.match(consumer, /PASSED/u);
    assert.match(consumer, /zero|positive/iu);
    assert.match(consumer, /UTF-8/iu);
    assert.match(consumer, /must not.*(?:infer|fabricate|repair)|Do not infer/isu);
    assert.match(consumer, /token count|silently truncate/iu);
    assert.match(consumer, /no global (?:assembled-context )?cap/iu);
    assert.match(consumer, /trusted source|source authorization/iu);
  });

  test('handoff templates and executor role share one versioned context rule', () => {
    for (const filePath of ['global/executor.md', 'templates/prompt.md', 'prompts/implementation.md']) {
      const body = text(filePath);
      // A missing version selects legacy v1; it is never itself a reason to block.
      assert.match(body, /absent(?: `contextPolicyVersion`)? means v1|`contextPolicyVersion` absent means v1/iu, filePath);
      assert.doesNotMatch(body, /BLOCKED`?[^\n]*(?:version|metadata) (?:or budget metadata )?is (?:missing|absent)/iu, filePath);
      assert.match(body, /- v1[^\n]*`assembledContextBudgetBytes: 32768`|^- `assembledContextBudgetBytes: 32768`$/imu, filePath);
      assert.match(body, /`assembledContextBudgetBytes: null`/u, filePath);
      assert.match(body, /no global cap/iu, filePath);
      // v2 is gated by Task Contract v2 and an allowlisted, non-excluded repository.
      assert.match(body, /Task Contract v2/u, filePath);
      assert.match(body, /allowlisted, non-excluded repository/u, filePath);
      assert.match(body, /`taskId`/u, filePath);
      assert.match(body, /trusted verifier\/runner evidence/u, filePath);
    }
    for (const filePath of ['templates/prompt.md', 'prompts/implementation.md']) {
      assert.match(text(filePath), /global\/executor\.md/u, filePath);
    }
  });

  test('records runtime assembly boundary without pretending npm verify checks invocation context', () => {
    const policy = `${text('global/architect.md')}\n${text('global/executor.md')}\n${text('prompts/implementation.md')}\n${text('templates/prompt.md')}`;
    assert.match(policy, /Step 10/iu);
    assert.match(policy, /producer\/runner|runner Step 10/iu);
    assert.match(policy, /npm run verify[^\n]*(?:does not|cannot)[^\n]*(?:runtime|invocation-specific|assembled context)/iu);
  });
});

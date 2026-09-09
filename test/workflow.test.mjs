import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const workflowFiles = [
  'AGENTS.md',
  'AI.md',
  'FLOW.md',
  'global/core.md',
  'global/architect.md',
  'global/executor.md',
  'global/reviewer.md',
  'global/context.md',
  'global/workflow.md'
];

const reusableAgentFiles = [
  ...workflowFiles,
  ...readdirSync('prompts').filter((filePath) => filePath.endsWith('.md')).map((filePath) => `prompts/${filePath}`),
  ...readdirSync('templates').filter((filePath) => filePath.endsWith('.md')).map((filePath) => `templates/${filePath}`)
];

describe('workflow documentation', () => {
  test('keeps reusable agent content free of Cyrillic text', () => {
    const cyrillic = reusableAgentFiles.flatMap((filePath) => readFileSync(filePath, 'utf8').split('\n')
      .filter((line) => /\p{Script=Cyrillic}/u.test(line))
      .map((line) => `${filePath}: ${line}`));
    assert.deepEqual(cyrillic, []);
  });

  test('does not give Luna an executable instruction to read human-only plans', () => {
    const forbidden = reusableAgentFiles.flatMap((filePath) => readFileSync(filePath, 'utf8').split('\n')
      .filter((line) => /(?:plan\.md|approved plan|human plan)/iu.test(line)
        && /(read|use|rely|follow|consume|использ)/iu.test(line)
        && !/(?:never|do not|does not|must not|without|не чита|не использ)/iu.test(line))
      .map((line) => `${filePath}: ${line}`));
    assert.deepEqual(forbidden, []);
  });

  test('documents the user-review and Luna-execution boundary explicitly', () => {
    const readme = readFileSync('README.md', 'utf8');
    const prompt = readFileSync('prompts/implementation.md', 'utf8');
    assert.match(readme, /пользователь.*plan\.md.*Luna.*не чита/isu);
    assert.match(prompt, /Luna.*never reads.*plan\.md/isu);
  });

  test('keeps workspace documentation sync as a canonical repository-creation gate', () => {
    for (const filePath of ['FLOW.md', 'global/core.md', 'global/architect.md']) {
      const text = readFileSync(filePath, 'utf8');
      assert.match(text, /syllik\/syllik/u, filePath);
      assert.match(text, /docs\/workspace\.md/u, filePath);
      assert.match(text, /docs\/repositories\.md/u, filePath);
      assert.match(text, /README\.md.*stable.*link/isu, filePath);
    }
  });

  test('keeps managed Codex review as the default PR review gate', () => {
    const flow = readFileSync('FLOW.md', 'utf8');
    const reviewer = readFileSync('global/reviewer.md', 'utf8');
    assert.match(flow, /managed Codex GitHub Code Review/iu);
    assert.match(flow, /@codex review/u);
    assert.match(flow, /automatically on every push to an open PR/iu);
    assert.match(flow, /valid only for the current PR head/iu);
    assert.match(flow, /@codex fix/u);
    assert.match(flow, /Sol 5\.6 High is escalation\/fallback only/iu);
    assert.match(reviewer, /previous review is stale/iu);
    assert.match(reviewer, /manual fallback\/retrigger/iu);
    assert.match(reviewer, /human\s+explicitly authorizes/iu);
    const executor = readFileSync('global/executor.md', 'utf8');
    assert.match(executor, /Routine published-PR review belongs to managed Codex GitHub Code Review/iu);
    assert.match(executor, /Sol 5\.6 High is escalation\/fallback only/iu);
    assert.doesNotMatch(executor, /Review and publication are separate Sol\/human responsibilities/iu);

    const promptTemplate = readFileSync('templates/prompt.md', 'utf8');
    const reviewTemplate = readFileSync('templates/review.md', 'utf8');
    assert.match(promptTemplate, /trusted\s+publication[\s\S]*managed\s+Codex\s+GitHub\s+Code\s+Review/iu);
    assert.match(reviewTemplate, /escalation\s*\/\s*fallback/iu);
    assert.match(reviewTemplate, /routine published PR review belongs to managed Codex GitHub Code Review/iu);
    assert.match(reviewTemplate, /runs automatically on every push to an open PR/iu);
    assert.match(reviewTemplate, /manual fallback\/retrigger/iu);
  });

  test('routes active work through explicit integration branches and restricts onboarding', () => {
    const flow = readFileSync('FLOW.md', 'utf8');
    assert.match(flow, /integrationBranch/u);
    assert.match(flow, /onboarding managed projects only onboarding\/alignment/iu);
    assert.match(flow, /Read-only projects are never write targets/iu);
  });

});

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

  test('makes mutation prohibitions and Policy SHA provenance explicit', () => {
    const prompt = readFileSync('prompts/implementation.md', 'utf8');
    const promptTemplate = readFileSync('templates/prompt.md', 'utf8');
    const stateTemplate = readFileSync('templates/state.md', 'utf8');
    const resultTemplate = readFileSync('templates/result.md', 'utf8');

    assert.match(prompt, /or\s+any GitHub mutation, including PR\s+creation\/update\/publication, merge, auto-merge, Issue metadata\/state, Project\s+#5 fields\/status, labels\/comments, releases, milestones, deployments,\s+repository settings, Actions variables, or any other mutable GitHub state\.\s+Trello mutation is also prohibited\./u);
    assert.match(promptTemplate, /Policy SHA is the exact immutable commit SHA of `syllik\/ai-workflow` whose\s+canonical policy was used to assemble the execution context for this task\./u);
    assert.match(promptTemplate, /The\s+task-specific execution prompt must explicitly supply this SHA\./u);
    assert.match(promptTemplate, /copy the supplied Policy SHA unchanged into persisted `state\.md` and\s+final `result\.md`/iu);
    assert.match(promptTemplate, /never infer Policy SHA from current HEAD at\s+execution time, target repository SHA, approval reference, Issue state, Project\s+state, or timestamps\./u);
    assert.match(promptTemplate, /If a persisted execution requires Policy SHA but it was not\s+supplied by the prepared task context, fail closed with `BLOCKED` rather than\s+guessing\./u);
    assert.match(stateTemplate, /Copy the supplied Policy SHA unchanged from the prepared task prompt; do not\s+infer or substitute it\./u);
    assert.match(resultTemplate, /Copy the supplied Policy SHA unchanged from the prepared task prompt; do not\s+infer or substitute it\./u);
  });

  test('keeps the generated execution prompt free of every GitHub mutation', () => {
    const promptTemplate = readFileSync('templates/prompt.md', 'utf8');

    assert.match(promptTemplate, /Luna must not perform any GitHub\s+mutation, including PR\s+creation\/update\/publication, merge, auto-merge, Issue\s+metadata\/state, Project\s+#5 fields\/status, labels\/comments, releases, milestones,\s+deployments,\s+repository settings, Actions variables, or any other mutable GitHub\s+state\.\s+Trello mutation is also prohibited\./u);
  });

  test('keeps the executor prohibition blanket and non-exhaustive', () => {
    const executor = readFileSync('global/executor.md', 'utf8');

    assert.match(executor, /Luna must not perform any GitHub mutation, including PR\s+creation\/update\/publication, merge, auto-merge, Issue\s+metadata\/state, Project\s+#5 fields\/status, labels\/comments, releases, milestones,\s+deployments,\s+repository settings, Actions variables, or any other mutable GitHub\s+state\.\s+Trello mutation is also prohibited\./u);
  });

  test('requires supplied approval provenance to be copied unchanged and fail closed when absent', () => {
    const promptTemplate = readFileSync('templates/prompt.md', 'utf8');
    const stateTemplate = readFileSync('templates/state.md', 'utf8');
    const resultTemplate = readFileSync('templates/result.md', 'utf8');

    assert.match(promptTemplate, /The prepared task context must explicitly supply an approval reference for this bounded scope\./u);
    assert.match(promptTemplate, /- Approval reference: `<supplied approval reference>`/u);
    assert.match(promptTemplate, /Luna must copy the supplied approval reference unchanged into persisted `state\.md` and\s+final `result\.md`\./u);
    assert.match(promptTemplate, /must not infer, invent, derive, normalize, or replace it/u);
    assert.match(promptTemplate, /If\s+the required approval reference is absent from the prepared task context, fail closed\s+with `BLOCKED` rather than guessing\./u);

    for (const template of [stateTemplate, resultTemplate]) {
      assert.match(template, /Copy the supplied approval reference unchanged from the prepared task prompt; do not infer, invent, derive, normalize, or replace it\./u);
      assert.match(template, /- Scope \/ approval reference:/u);
    }
  });

  test('supports supplied task identities for ChipIn and non-ChipIn persisted tasks', () => {
    const promptTemplate = readFileSync('templates/prompt.md', 'utf8');
    const stateTemplate = readFileSync('templates/state.md', 'utf8');
    const resultTemplate = readFileSync('templates/result.md', 'utf8');

    assert.match(promptTemplate, /- Task identity: `<supplied task identity>`/u);
    assert.match(promptTemplate, /For ChipIn tasks, canonical task identity is `owner\/repository#issue`\./u);
    assert.match(promptTemplate, /For non-ChipIn tasks, do not fabricate a GitHub Issue identity; the persisted\s+task may use its already supplied task-specific identity, when one exists\./u);
    assert.match(promptTemplate, /The\s+execution prompt remains authoritative for what task identity was supplied\./u);
    assert.match(promptTemplate, /If\s+a task type requires an identity but the prepared task context does not supply\s+one, fail closed with `BLOCKED` rather than inventing one\./u);

    for (const template of [stateTemplate, resultTemplate]) {
      assert.match(template, /- Task identity:\n/u);
      assert.match(template, /Copy the supplied task identity unchanged from the prepared task prompt; do not\s+infer, substitute, or fabricate a GitHub Issue identity\./u);
      assert.match(template, /Copy the supplied Policy SHA unchanged from the prepared task prompt; do not\s+infer or substitute it\./u);
      assert.match(template, /For ChipIn tasks,\s+canonical task identity is `owner\/repository#issue`\./u);
      assert.match(template, /For non-ChipIn tasks,\s+preserve the supplied task-specific identity unchanged; do not invent a GitHub\s+Issue\./u);
    }
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
    assert.match(flow, /contextDependencies/u);
    assert.match(flow, /unavailable required context blocks work/iu);
  });

});

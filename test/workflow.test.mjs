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
});

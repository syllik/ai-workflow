import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const workflowFiles = [
  'README.md',
  'AGENTS.md',
  'prompts/implementation.md',
  'AI.md',
  'FLOW.md',
  'global/core.md',
  'global/architect.md',
  'global/executor.md',
  'global/context.md',
  'global/workflow.md'
];

describe('workflow documentation', () => {
  test('does not give Luna an executable instruction to read human-only plans', () => {
    const forbidden = workflowFiles.flatMap((filePath) => readFileSync(filePath, 'utf8').split('\n')
      .filter((line) => /plan\.md/u.test(line) && /(read|прочит)/iu.test(line) && !/(never|do not|никогда|не чита|не использ)/iu.test(line))
      .map((line) => `${filePath}: ${line}`));
    assert.deepEqual(forbidden, []);
  });

  test('documents the user-review and Luna-execution boundary explicitly', () => {
    const readme = readFileSync('README.md', 'utf8');
    const prompt = readFileSync('prompts/implementation.md', 'utf8');
    assert.match(readme, /пользователь.*plan\.md.*Luna.*не чита/isu);
    assert.match(prompt, /Luna.*(?:never read|не чита).*plan\.md/isu);
  });
});

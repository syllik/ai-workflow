import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BUDGETS, checkBudget, checkBudgets, utf8Bytes } from '../scripts/workspace/budgets.mjs';

describe('budgets', () => {
  test('counts UTF-8 bytes rather than JavaScript characters', () => {
    assert.equal(utf8Bytes('é'), 2);
    assert.equal(utf8Bytes('🙂'), 4);
  });

  test('returns a stable finding when one file exceeds its byte budget', () => {
    const findings = checkBudget({ path: 'FLOW.md', text: 'é'.repeat(1025) }, BUDGETS);
    assert.deepEqual(findings, [{
      code: 'BUDGET_EXCEEDED',
      path: 'FLOW.md',
      actualBytes: 2050,
      maxBytes: 2048,
      actual: 2050,
      maximum: 2048
    }]);
  });

  test('checks multiple entries in path order and reports every hard budget', () => {
    const entries = Object.entries(BUDGETS).map(([path, maxBytes]) => ({
      path,
      text: 'x'.repeat(maxBytes + 1)
    }));
    const findings = checkBudgets(entries, BUDGETS);
    assert.deepEqual(findings.map(({ code, path, actualBytes, maxBytes }) => ({ code, path, actualBytes, maxBytes })), Object.entries(BUDGETS)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, maxBytes]) => ({ code: 'BUDGET_EXCEEDED', path, actualBytes: maxBytes + 1, maxBytes })));
  });

  test('accepts text at the exact UTF-8 boundary', () => {
    assert.deepEqual(checkBudget({ path: 'AI.md', text: 'é'.repeat(512) }, BUDGETS), []);
  });
});

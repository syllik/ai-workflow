import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BUDGETS, checkAssembledExecutionContext, checkBudget, checkBudgets, utf8Bytes } from '../scripts/workspace/budgets.mjs';

describe('budgets', () => {
  test('reports empty assembled execution context as zero bytes without a finding', () => {
    assert.deepEqual(checkAssembledExecutionContext([]), {
      actualBytes: 0,
      maxBytes: 32768,
      findings: []
    });
  });

  test('sums multiple assembled execution context entries by UTF-8 bytes', () => {
    const result = checkAssembledExecutionContext(['AI', 'é', '🙂']);
    assert.equal(result.actualBytes, 8);
    assert.equal(result.maxBytes, 32768);
    assert.deepEqual(result.findings, []);
  });

  test('accepts assembled execution context at the exact aggregate boundary', () => {
    const result = checkAssembledExecutionContext(['x'.repeat(32768)]);
    assert.equal(result.actualBytes, 32768);
    assert.deepEqual(result.findings, []);
  });

  test('reports the stable aggregate finding when assembled context exceeds its limit', () => {
    const result = checkAssembledExecutionContext(['x'.repeat(32769)]);
    assert.equal(result.actualBytes, 32769);
    assert.deepEqual(result.findings, [{
      code: 'ASSEMBLED_CONTEXT_BUDGET_EXCEEDED',
      actualBytes: 32769,
      maxBytes: 32768
    }]);
  });

  test('counts multibyte assembled execution context content as UTF-8 bytes', () => {
    const result = checkAssembledExecutionContext(['é'.repeat(16384), '🙂']);
    assert.equal(result.actualBytes, 32772);
    assert.equal(result.findings[0]?.code, 'ASSEMBLED_CONTEXT_BUDGET_EXCEEDED');
  });

  test('does not change the aggregate result when entries are reordered', () => {
    const first = checkAssembledExecutionContext(['one', 'é', '🙂']);
    const second = checkAssembledExecutionContext(['🙂', 'one', 'é']);
    assert.equal(first.actualBytes, second.actualBytes);
    assert.deepEqual(first.findings, second.findings);
  });

  test('does not interpret the aggregate configuration key as a per-file path budget', () => {
    assert.deepEqual(checkBudget({ path: 'assembled execution context', text: 'x'.repeat(32769) }, BUDGETS), []);
  });

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
    const entries = Object.entries(BUDGETS)
      .filter(([path]) => path !== 'assembled execution context')
      .map(([path, maxBytes]) => ({
      path,
      text: 'x'.repeat(maxBytes + 1)
      }));
    const findings = checkBudgets(entries, BUDGETS);
    assert.deepEqual(findings.map(({ code, path, actualBytes, maxBytes }) => ({ code, path, actualBytes, maxBytes })), Object.entries(BUDGETS)
      .filter(([path]) => path !== 'assembled execution context')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, maxBytes]) => ({ code: 'BUDGET_EXCEEDED', path, actualBytes: maxBytes + 1, maxBytes })));
  });

  test('applies the AI budget to nested profile AI paths', () => {
    const findings = checkBudget({ path: 'profile/syllik/AI.md', text: 'x'.repeat(1025) }, BUDGETS);
    assert.equal(findings[0]?.code, 'BUDGET_EXCEEDED');
    assert.equal(findings[0]?.path, 'profile/syllik/AI.md');
    assert.equal(findings[0]?.maxBytes, 1024);
  });

  test('accepts text at the exact UTF-8 boundary', () => {
    assert.deepEqual(checkBudget({ path: 'AI.md', text: 'é'.repeat(512) }, BUDGETS), []);
  });
});

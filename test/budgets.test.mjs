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

  test('exposes the canonical aggregate execution context budget', () => {
    assert.equal(checkAssembledExecutionContext([]).maxBytes, 32768);
  });

  test('sums multiple assembled execution context entries by UTF-8 bytes', () => {
    const result = checkAssembledExecutionContext(['AI', 'é', '🙂']);
    assert.equal(result.actualBytes, 8);
    assert.equal(result.maxBytes, 32768);
    assert.deepEqual(result.findings, []);
  });

  test('accepts an assembled execution context entry with text', () => {
    const result = checkAssembledExecutionContext([{ text: 'AI' }]);
    assert.equal(result.actualBytes, 2);
    assert.deepEqual(result.findings, []);
  });

  test('accepts an assembled execution context entry with content', () => {
    const result = checkAssembledExecutionContext([{ content: 'AI' }]);
    assert.equal(result.actualBytes, 2);
    assert.deepEqual(result.findings, []);
  });

  test('accepts an explicitly empty text entry as zero bytes', () => {
    const result = checkAssembledExecutionContext([{ text: '' }]);
    assert.equal(result.actualBytes, 0);
    assert.deepEqual(result.findings, []);
  });

  test('accepts an explicitly empty content entry as zero bytes', () => {
    const result = checkAssembledExecutionContext([{ content: '' }]);
    assert.equal(result.actualBytes, 0);
    assert.deepEqual(result.findings, []);
  });

  test('rejects an object with an unmeasurable body instead of counting it as zero bytes', () => {
    const result = checkAssembledExecutionContext([{ path: 'x', body: 'x'.repeat(40000) }]);
    assert.equal(result.actualBytes, 0);
    assert.deepEqual(result.findings, [{
      code: 'INVALID_ASSEMBLED_CONTEXT_ENTRY',
      index: 0
    }]);
  });

  test('rejects an empty object assembled execution context entry', () => {
    assert.deepEqual(checkAssembledExecutionContext([{}]).findings, [{
      code: 'INVALID_ASSEMBLED_CONTEXT_ENTRY',
      index: 0
    }]);
  });

  test('rejects null assembled execution context entries', () => {
    assert.deepEqual(checkAssembledExecutionContext([null]).findings, [{
      code: 'INVALID_ASSEMBLED_CONTEXT_ENTRY',
      index: 0
    }]);
  });

  test('rejects numeric assembled execution context entries', () => {
    assert.deepEqual(checkAssembledExecutionContext([42]).findings, [{
      code: 'INVALID_ASSEMBLED_CONTEXT_ENTRY',
      index: 0
    }]);
  });

  test('rejects boolean assembled execution context entries', () => {
    assert.deepEqual(checkAssembledExecutionContext([true]).findings, [{
      code: 'INVALID_ASSEMBLED_CONTEXT_ENTRY',
      index: 0
    }]);
  });

  test('rejects array assembled execution context entries', () => {
    assert.deepEqual(checkAssembledExecutionContext([[]]).findings, [{
      code: 'INVALID_ASSEMBLED_CONTEXT_ENTRY',
      index: 0
    }]);
  });

  test('rejects a non-string text value', () => {
    assert.deepEqual(checkAssembledExecutionContext([{ text: 42 }]).findings, [{
      code: 'INVALID_ASSEMBLED_CONTEXT_ENTRY',
      index: 0
    }]);
  });

  test('rejects a non-string content value', () => {
    assert.deepEqual(checkAssembledExecutionContext([{ content: false }]).findings, [{
      code: 'INVALID_ASSEMBLED_CONTEXT_ENTRY',
      index: 0
    }]);
  });

  test('reports multiple invalid assembled entries in input order', () => {
    const result = checkAssembledExecutionContext([{}, 'valid', null, { content: 1 }]);
    assert.equal(result.actualBytes, 5);
    assert.deepEqual(result.findings, [
      { code: 'INVALID_ASSEMBLED_CONTEXT_ENTRY', index: 0 },
      { code: 'INVALID_ASSEMBLED_CONTEXT_ENTRY', index: 2 },
      { code: 'INVALID_ASSEMBLED_CONTEXT_ENTRY', index: 3 }
    ]);
  });

  test('does not suppress an aggregate finding when malformed entries accompany over-budget valid content', () => {
    const result = checkAssembledExecutionContext([{}, 'x'.repeat(32769), null]);
    assert.equal(result.actualBytes, 32769);
    assert.deepEqual(result.findings, [
      { code: 'INVALID_ASSEMBLED_CONTEXT_ENTRY', index: 0 },
      { code: 'INVALID_ASSEMBLED_CONTEXT_ENTRY', index: 2 },
      {
        code: 'ASSEMBLED_CONTEXT_BUDGET_EXCEEDED',
        actualBytes: 32769,
        maxBytes: 32768
      }
    ]);
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

  test('rejects oversized assembled context when the aggregate config object is empty', () => {
    const result = checkAssembledExecutionContext(['x'.repeat(40000)], {});
    assert.equal(result.maxBytes, 32768);
    assert.deepEqual(result.findings, [{
      code: 'ASSEMBLED_CONTEXT_BUDGET_EXCEEDED',
      actualBytes: 40000,
      maxBytes: 32768
    }]);
  });

  test('ignores a caller-supplied larger aggregate budget', () => {
    const result = checkAssembledExecutionContext(['x'.repeat(40000)], {
      'assembled execution context': 999999
    });
    assert.equal(result.maxBytes, 32768);
    assert.deepEqual(result.findings, [{
      code: 'ASSEMBLED_CONTEXT_BUDGET_EXCEEDED',
      actualBytes: 40000,
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

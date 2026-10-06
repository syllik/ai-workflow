import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTaskContextPackage } from '../scripts/workspace/context-producer.mjs';

const policySha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const headSha = 'c'.repeat(40);
const dependencySha = 'd'.repeat(40);

function input(overrides = {}) {
  return {
    policySha,
    baseSha,
    headSha,
    acceptance: { text: 'Use exact-SHA context and fail closed.' },
    requirementIds: ['DSH-001'],
    dependencies: [{ repository: 'ChipIn-one/chipin-knowledge-base', revisionSha: dependencySha, expectedRevisionSha: dependencySha }],
    sources: [
      { kind: 'policy', repository: 'syllik/ai-workflow', path: 'FLOW.md', revisionSha: policySha, expectedRevisionSha: policySha, content: '# policy\n' },
      { kind: 'dependency', repository: 'ChipIn-one/chipin-knowledge-base', path: 'common/specs/dashboard.md', revisionSha: dependencySha, expectedRevisionSha: dependencySha, content: '**DSH-001** behavior\n', requirementIds: ['DSH-001'] }
    ],
    ...overrides
  };
}

test('builds a deterministic minimal handoff with exact dependency SHA and UTF-8 byte provenance', () => {
  const first = buildTaskContextPackage(input());
  const second = buildTaskContextPackage(input());
  assert.equal(first.passed, true);
  assert.deepEqual(second, first);
  assert.equal(first.manifest.dependencies[0].revisionSha, dependencySha);
  assert.equal(first.handoffProvenance.assembledContextBudgetBytes, 32768);
  assert.equal(first.handoffProvenance.assembledContextActualBytes, Buffer.byteLength(first.assembledContext, 'utf8'));
  assert.equal(first.handoffProvenance.assembledContextCheck, 'PASSED');
  assert.match(first.manifest.assembledContextSha256, /^[0-9a-f]{64}$/u);
});

test('blocks unavailable required dependency context', () => {
  const result = buildTaskContextPackage(input({ sources: [input().sources[0]] }));
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_DEPENDENCY_UNAVAILABLE'), true);
});

test('blocks whitespace-only required source content without rewriting the original body', () => {
  const value = input();
  value.sources[1].content = ' \n\t ';
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code, path }) =>
    code === 'CONTEXT_SOURCE_UNAVAILABLE' && path === 'sources.1.content'), true);
  assert.equal(result.assembledContext.includes(' \n\t '), true);
});

test('blocks stale source and dependency revisions', () => {
  const stale = 'e'.repeat(40);
  const value = input();
  value.dependencies[0].revisionSha = stale;
  value.sources[1].revisionSha = stale;
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_DEPENDENCY_STALE'), true);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_SOURCE_STALE'), true);
});

test('blocks a required requirement id that is not represented by selected context', () => {
  const value = input();
  value.sources[1].requirementIds = [];
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_REQUIREMENT_UNAVAILABLE'), true);
});

test('blocks oversize context without truncating required documents', () => {
  const value = input();
  const marker = 'REQUIRED_DOCUMENT_TAIL';
  value.sources[1].content = `${'x'.repeat(40000)}${marker}`;
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'ASSEMBLED_CONTEXT_BUDGET_EXCEEDED'), true);
  assert.equal(result.handoffProvenance.assembledContextActualBytes > 32768, true);
  assert.equal(result.assembledContext.includes(marker), true);
});

test('counts multibyte context as UTF-8 bytes rather than characters', () => {
  const value = input({ acceptance: { text: '🙂' } });
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, true);
  assert.equal(result.manifest.acceptance.bytes, 4);
  assert.equal(result.handoffProvenance.assembledContextActualBytes, Buffer.byteLength(result.assembledContext, 'utf8'));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTaskContextPackage } from '../scripts/workspace/context-producer.mjs';

const policySha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const headSha = 'c'.repeat(40);
const dependencySha = 'd'.repeat(40);

function canonicalSources() {
  return [
    { kind: 'policy', repository: 'syllik/ai-workflow', path: 'AI.md', revisionSha: policySha, expectedRevisionSha: policySha, content: '# entry\n' },
    { kind: 'policy', repository: 'syllik/ai-workflow', path: 'FLOW.md', revisionSha: policySha, expectedRevisionSha: policySha, content: '# flow\n' },
    { kind: 'policy', repository: 'syllik/ai-workflow', path: 'workspace.yaml', revisionSha: policySha, expectedRevisionSha: policySha, content: 'schemaVersion: 2\n' },
    { kind: 'policy', repository: 'syllik/ai-workflow', path: 'projects/index.md', revisionSha: policySha, expectedRevisionSha: policySha, content: '# projects\n' },
    { kind: 'policy', repository: 'syllik/ai-workflow', path: 'global/workflow.md', revisionSha: policySha, expectedRevisionSha: policySha, content: '# roles\n' },
    { kind: 'role', repository: 'syllik/ai-workflow', path: 'global/executor.md', revisionSha: policySha, expectedRevisionSha: policySha, content: '# executor\n' },
    { kind: 'target', repository: 'syllik/ai-workflow', path: 'AGENTS.md', revisionSha: policySha, expectedRevisionSha: policySha, content: '# rules\n' },
    { kind: 'target', repository: 'syllik/ai-workflow', path: '.ai/context.md', revisionSha: policySha, expectedRevisionSha: policySha, content: '# context\n' },
    { kind: 'dependency', repository: 'ChipIn-one/chipin-knowledge-base', path: 'common/specs/dashboard.md', revisionSha: dependencySha, expectedRevisionSha: dependencySha, content: '**DSH-001** behavior\n', requirementIds: ['DSH-001'] }
  ];
}

function expectedSources(sources) {
  return sources.map(({ kind, repository, path, revisionSha }) => ({ kind, repository, path, revisionSha }));
}

function input(overrides = {}) {
  const sources = canonicalSources();
  return {
    policySha,
    baseSha,
    headSha,
    acceptance: { text: 'Use exact-SHA context and fail closed.' },
    requirementIds: ['DSH-001'],
    expectedSources: expectedSources(sources),
    dependencies: [{ repository: 'ChipIn-one/chipin-knowledge-base', revisionSha: dependencySha, expectedRevisionSha: dependencySha }],
    sources,
    ...overrides
  };
}

function sourceByPath(value, path) {
  return value.sources.find((source) => source.path === path);
}

test('builds a deterministic minimal handoff with complete expected sources, exact dependency SHA and UTF-8 byte provenance', () => {
  const first = buildTaskContextPackage(input());
  const second = buildTaskContextPackage(input());
  assert.equal(first.passed, true);
  assert.deepEqual(second, first);
  assert.equal(first.manifest.expectedSources.length, 9);
  assert.equal(first.manifest.dependencies[0].revisionSha, dependencySha);
  assert.equal(first.handoffProvenance.assembledContextBudgetBytes, 32768);
  assert.equal(first.handoffProvenance.assembledContextActualBytes, Buffer.byteLength(first.assembledContext, 'utf8'));
  assert.equal(first.handoffProvenance.assembledContextCheck, 'PASSED');
  assert.match(first.manifest.assembledContextSha256, /^[0-9a-f]{64}$/u);
});

test('blocks a missing mandatory source from the explicit expected-source set', () => {
  const value = input();
  value.sources = value.sources.filter(({ path }) => path !== 'AI.md');
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code, expected }) =>
    code === 'CONTEXT_EXPECTED_SOURCE_UNAVAILABLE' && expected?.path === 'AI.md'), true);
});

test('requires a non-empty explicit expected-source set', () => {
  const result = buildTaskContextPackage(input({ expectedSources: [] }));
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_EXPECTED_SOURCES_UNAVAILABLE'), true);
});

test('blocks unavailable required dependency context', () => {
  const value = input();
  value.sources = value.sources.filter(({ repository }) => repository !== 'ChipIn-one/chipin-knowledge-base');
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_DEPENDENCY_UNAVAILABLE'), true);
});

test('blocks whitespace-only required source content', () => {
  const value = input();
  sourceByPath(value, 'common/specs/dashboard.md').content = ' \n\t ';
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code, path }) =>
    code === 'CONTEXT_SOURCE_UNAVAILABLE' && path.endsWith('.content')), true);
});

test('preserves original whitespace for valid source hashing and assembly', () => {
  const value = input();
  sourceByPath(value, 'common/specs/dashboard.md').content = ' \n**DSH-001** behavior\n\t ';
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, true);
  assert.equal(result.assembledContext.includes(sourceByPath(value, 'common/specs/dashboard.md').content), true);
  const manifestSource = result.manifest.sources.find(({ path }) => path === 'common/specs/dashboard.md');
  assert.equal(manifestSource.bytes, Buffer.byteLength(sourceByPath(value, 'common/specs/dashboard.md').content, 'utf8'));
});

test('blocks whitespace-only acceptance while preserving valid acceptance verbatim', () => {
  const blank = buildTaskContextPackage(input({ acceptance: { text: ' \n\t ' } }));
  assert.equal(blank.passed, false);
  assert.equal(blank.findings.some(({ code }) => code === 'CONTEXT_ACCEPTANCE_UNAVAILABLE'), true);

  const original = ' \nKeep this exact acceptance text.\n\t ';
  const valid = buildTaskContextPackage(input({ acceptance: { text: original } }));
  assert.equal(valid.passed, true);
  assert.equal(valid.assembledContext.includes(original), true);
  assert.equal(valid.manifest.acceptance.bytes, Buffer.byteLength(original, 'utf8'));
});

test('blocks stale source and dependency revisions', () => {
  const stale = 'e'.repeat(40);
  const value = input();
  value.dependencies[0].revisionSha = stale;
  sourceByPath(value, 'common/specs/dashboard.md').revisionSha = stale;
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_DEPENDENCY_STALE'), true);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_SOURCE_STALE'), true);
});

test('blocks a required requirement id that is not represented by selected context', () => {
  const value = input();
  sourceByPath(value, 'common/specs/dashboard.md').requirementIds = [];
  const result = buildTaskContextPackage(value);
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(({ code }) => code === 'CONTEXT_REQUIREMENT_UNAVAILABLE'), true);
});

test('blocks oversize context without truncating required documents', () => {
  const value = input();
  const marker = 'REQUIRED_DOCUMENT_TAIL';
  sourceByPath(value, 'common/specs/dashboard.md').content = `${'x'.repeat(40000)}${marker}`;
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

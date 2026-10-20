import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, chmod, readFile, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createContextCheckpointStore } from '../scripts/workspace/context-checkpoint-store.mjs';
import { signContextCheckpoint } from '../scripts/workspace/context-policy.mjs';

const sha = 'a'.repeat(40);
const repository = 'syllik/ai-workflow';
const secret = 'trusted checkpoint secret held outside agent context';
const checkpointId = 'issue-64-context-policy';
const source = {
  kind: 'policy', repository, path: 'FLOW.md', revisionSha: sha,
  blobSha: 'b'.repeat(40), sha256: 'c'.repeat(64)
};

function payload(overrides = {}) {
  return {
    contractVersion: 2, contextPolicyVersion: 2, policySha: sha, baseSha: sha, headSha: sha,
    repository, approval: { reference: 'owner-approval' }, allowedPaths: ['scripts/workspace/**'],
    sources: [source], requirementCoverage: ['I0'], completedWork: [], pendingWork: ['checkpoint'],
    validationEvidence: ['local-test'], ...overrides
  };
}

function current(overrides = {}) {
  const p = payload(overrides);
  return {
    ...p, freshAuthorityValidated: true, allMandatorySourcesRehydrated: true,
    coverageRevalidated: true
  };
}

async function makeStore() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ai-workflow-context-checkpoint-'));
  return {
    directory,
    store: createContextCheckpointStore({ directory, secretProvider: () => secret })
  };
}

function has(findings, code) {
  return findings.some(item => item.code === code);
}

test('checkpoint store persists atomically with protected file mode and survives a fresh store instance', async () => {
  const { directory, store } = await makeStore();
  const saved = await store.save(checkpointId, payload(), { sequence: 1 });
  assert.equal(saved.valid, true);
  assert.equal((await stat(saved.path)).mode & 0o077, 0);
  const raw = await readFile(saved.path, 'utf8');
  assert.equal(raw.endsWith('\n'), true);
  const restored = await createContextCheckpointStore({ directory, secretProvider: async () => secret })
    .loadLatest(checkpointId, { current: current() });
  assert.equal(restored.valid, true);
  assert.equal(restored.sequence, 1);
  assert.deepEqual(restored.payload.pendingWork, ['checkpoint']);
});

test('checkpoint store rejects duplicate and rollback sequences', async () => {
  const { store } = await makeStore();
  assert.equal((await store.save(checkpointId, payload(), { sequence: 2 })).valid, true);
  const duplicate = await store.save(checkpointId, payload(), { sequence: 2 });
  const rollback = await store.save(checkpointId, payload(), { sequence: 1 });
  assert.equal(has(duplicate.findings, 'CHECKPOINT_REPLAY'), true);
  assert.equal(has(rollback.findings, 'CHECKPOINT_REPLAY'), true);
  assert.equal((await store.loadLatest(checkpointId, { current: current() })).sequence, 2);
});

test('forged and partial records fail closed instead of falling back to an older checkpoint', async () => {
  const { store } = await makeStore();
  const saved = await store.save(checkpointId, payload(), { sequence: 1 });
  const checkpoint = JSON.parse(await readFile(saved.path, 'utf8'));
  checkpoint.payload.pendingWork = ['forged'];
  await writeFile(saved.path, JSON.stringify(checkpoint));
  const forged = await store.loadLatest(checkpointId, { current: current() });
  assert.equal(forged.valid, false);
  assert.equal(has(forged.findings, 'FORGED_CHECKPOINT'), true);

  const partial = await store.save('partial-record', payload(), { sequence: 1 });
  await writeFile(partial.path, '{}');
  const malformed = await store.loadLatest('partial-record', { current: current() });
  assert.equal(malformed.valid, false);
  assert.equal(has(malformed.findings, 'INVALID_CHECKPOINT'), true);
});

test('restart recovery still requires current authority and pinned-source revalidation', async () => {
  const { directory, store } = await makeStore();
  await store.save(checkpointId, payload(), { sequence: 1 });
  const restarted = createContextCheckpointStore({ directory, secretProvider: () => secret });
  const drifted = await restarted.loadLatest(checkpointId, { current: current({ headSha: 'd'.repeat(40) }) });
  assert.equal(drifted.valid, false);
  assert.equal(has(drifted.findings, 'CHECKPOINT_REPOSITORY_DRIFT'), true);
  const stale = await restarted.loadLatest(checkpointId, { current: { ...current(), freshAuthorityValidated: false } });
  assert.equal(has(stale.findings, 'CHECKPOINT_REVALIDATION_REQUIRED'), true);
});

test('checkpoint storage requires a private directory and an out-of-agent secret provider', async () => {
  const { directory } = await makeStore();
  await chmod(directory, 0o755);
  const unsafe = createContextCheckpointStore({ directory, secretProvider: () => secret });
  const result = await unsafe.save(checkpointId, payload(), { sequence: 1 });
  assert.equal(result.valid, false);
  assert.equal(has(result.findings, 'CHECKPOINT_STORAGE_UNSAFE'), true);

  const safeDirectory = await mkdtemp(path.join(os.tmpdir(), 'ai-workflow-context-checkpoint-no-secret-'));
  const noSecret = createContextCheckpointStore({ directory: safeDirectory });
  const missing = await noSecret.save(checkpointId, payload(), { sequence: 1 });
  assert.equal(missing.valid, false);
  assert.equal(has(missing.findings, 'CHECKPOINT_SECRET_UNAVAILABLE'), true);
});

test('checkpoint store signs the exact payload used by the shared verifier', async () => {
  const { store } = await makeStore();
  const saved = await store.save(checkpointId, payload(), { sequence: 7 });
  const expected = signContextCheckpoint({ ...payload(), checkpointId, sequence: 7 }, secret);
  assert.deepEqual(JSON.parse(await readFile(saved.path, 'utf8')), expected);
});

test('a contended save never releases a lock held by another writer', async () => {
  const { directory, store } = await makeStore();
  assert.equal((await store.save(checkpointId, payload(), { sequence: 1 })).valid, true);
  const lockPath = path.join(directory, `${createHash('sha256').update(checkpointId, 'utf8').digest('hex')}.lock`);
  await writeFile(lockPath, '', { mode: 0o600 });
  const contended = await store.save(checkpointId, payload(), { sequence: 2 });
  assert.equal(contended.valid, false);
  assert.equal((await stat(lockPath)).isFile(), true);
  const blocked = await store.save(checkpointId, payload(), { sequence: 3 });
  assert.equal(blocked.valid, false);
  assert.equal((await stat(lockPath)).isFile(), true);
});

test('deleting the newest record cannot roll the checkpoint back', async () => {
  const { directory, store } = await makeStore();
  assert.equal((await store.save(checkpointId, payload(), { sequence: 1 })).valid, true);
  const second = await store.save(checkpointId, payload({ pendingWork: ['next'] }), { sequence: 2 });
  assert.equal(second.valid, true);
  const { unlink } = await import('node:fs/promises');
  await unlink(second.path);
  const loaded = await store.loadLatest(checkpointId, { current: current() });
  assert.equal(loaded.valid, false);
  assert.equal(loaded.findings.some(({ code }) => code === 'CHECKPOINT_ROLLBACK_DETECTED'), true);
  const resaved = await store.save(checkpointId, payload(), { sequence: 2 });
  assert.equal(resaved.valid, false);
});

test('a tampered head record fails closed', async () => {
  const { directory, store } = await makeStore();
  assert.equal((await store.save(checkpointId, payload(), { sequence: 1 })).valid, true);
  const headPath = path.join(directory, `${createHash('sha256').update(checkpointId, 'utf8').digest('hex')}.head`);
  const head = JSON.parse(await readFile(headPath, 'utf8'));
  await writeFile(headPath, JSON.stringify({ ...head, sequence: 0 }), { mode: 0o600 });
  const loaded = await store.loadLatest(checkpointId, { current: current() });
  assert.equal(loaded.valid, false);
  assert.equal(loaded.findings.some(({ code }) => code === 'CHECKPOINT_HEAD_INVALID'), true);
});

test('a live lock reports CHECKPOINT_LOCKED and a crashed writer lock is reclaimed', async () => {
  const { directory, store } = await makeStore();
  const lockPath = path.join(directory, `${createHash('sha256').update(checkpointId, 'utf8').digest('hex')}.lock`);
  await writeFile(lockPath, `${process.pid}:${Date.now()}`, { mode: 0o600 });
  const locked = await store.save(checkpointId, payload(), { sequence: 1 });
  assert.equal(locked.valid, false);
  assert.equal(locked.findings.some(({ code }) => code === 'CHECKPOINT_LOCKED'), true);
  await writeFile(lockPath, `2147483646:${Date.now()}`, { mode: 0o600 });
  const reclaimed = await store.save(checkpointId, payload(), { sequence: 1 });
  assert.equal(reclaimed.valid, true);
});

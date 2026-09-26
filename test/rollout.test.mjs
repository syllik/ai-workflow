import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { renderAgentsBlock, renderProfileNavigation } from '../scripts/workspace/render.mjs';
import { evaluatePilotRollout, inspectMaterializedTarget, loadRolloutPolicy, validateRolloutPolicy } from '../scripts/workspace/rollout.mjs';
import { fixtureManifest, git, initFixtureRepo, makeFixtureRoot, removeFixtureRoot } from './helpers.mjs';

const POLICY_SHA = 'a'.repeat(40);

function pilotManifest() {
  const base = fixtureManifest();
  const central = base.projects.find(({ repository }) => repository === 'syllik/ai-workflow');
  const profile = base.projects.find(({ repository }) => repository === 'syllik/syllik');
  const org = {
    id: 'ChipIn-one/.github',
    repository: 'ChipIn-one/.github',
    localPath: 'products/chipin/.github',
    group: 'products/chipin',
    access: 'managed',
    status: 'active',
    integrationBranch: 'main',
    contextPath: '.ai/context.md'
  };
  return fixtureManifest({ projects: [profile, org, central] });
}

function materializeManagedTarget(root, project, manifest, { staleAgents = false, dirty = false } = {}) {
  const repositoryRoot = path.join(root, project.localPath);
  initFixtureRepo(repositoryRoot, `https://github.com/${project.repository}.git`, project.integrationBranch);
  mkdirSync(path.join(repositoryRoot, '.ai'), { recursive: true });
  const localPrefix = '# Local instructions\n\nKeep this text unchanged.\n\n';
  const agentsManifest = staleAgents ? { ...manifest, canonicalRoot: '~/OLD-WORK' } : manifest;
  writeFileSync(path.join(repositoryRoot, 'AGENTS.md'), localPrefix + renderAgentsBlock(agentsManifest), 'utf8');
  writeFileSync(path.join(repositoryRoot, project.contextPath), '# Project context\n', 'utf8');
  writeFileSync(path.join(repositoryRoot, '.ai/decisions.md'), '# Decisions\n', 'utf8');
  if (project.repository === 'syllik/syllik') {
    writeFileSync(path.join(repositoryRoot, 'AI.md'), renderProfileNavigation(manifest), 'utf8');
  }
  git(repositoryRoot, 'add', '.');
  git(repositoryRoot, 'commit', '--quiet', '-m', 'managed target');
  const targetSha = git(repositoryRoot, 'rev-parse', 'HEAD');
  git(repositoryRoot, 'switch', '--quiet', '--detach', targetSha);
  if (dirty) writeFileSync(path.join(repositoryRoot, 'local-wip.txt'), 'wip\n', 'utf8');
  return { repositoryRoot, targetSha, agentsPath: path.join(repositoryRoot, 'AGENTS.md') };
}

test('rollout policy is an exact two-repository pilot with read-only GitHub App auth', () => {
  const manifest = pilotManifest();
  const policy = loadRolloutPolicy();
  assert.deepEqual(validateRolloutPolicy(policy, manifest), []);
  assert.deepEqual(policy.targets, ['syllik/syllik', 'ChipIn-one/.github']);
  assert.deepEqual(policy.authentication.permissions, { contents: 'read' });
});

test('rollout policy fails closed on allowlist expansion', () => {
  const manifest = pilotManifest();
  const policy = loadRolloutPolicy();
  const expanded = { ...policy, targets: [...policy.targets, 'ChipIn-one/chipin-frontend'] };
  const findings = validateRolloutPolicy(expanded, manifest);
  assert.equal(findings.some(({ code }) => code === 'ROLLOUT_ALLOWLIST_MISMATCH'), true);
  assert.equal(findings.some(({ code }) => code === 'ROLLOUT_TARGET_NOT_ALLOWED'), true);
});

test('aligned pilot targets produce exact-revision receipts and retries are idempotent', () => {
  const root = makeFixtureRoot();
  try {
    const manifest = pilotManifest();
    const policy = loadRolloutPolicy();
    const materialized = new Map();
    for (const project of manifest.projects.filter(({ repository }) => policy.targets.includes(repository))) {
      materialized.set(project.repository, materializeManagedTarget(root, project, manifest));
    }
    const materializeTarget = (project) => materialized.get(project.repository);
    const first = evaluatePilotRollout({ manifest, policy, policySha: POLICY_SHA, materializeTarget });
    const second = evaluatePilotRollout({ manifest, policy, policySha: POLICY_SHA, materializeTarget });

    assert.equal(first.passed, true);
    assert.deepEqual(second, first);
    assert.deepEqual(first.receipts.map(({ repository, outcome }) => ({ repository, outcome })), [
      { repository: 'syllik/syllik', outcome: 'complete' },
      { repository: 'ChipIn-one/.github', outcome: 'complete' }
    ]);
    for (const receipt of first.receipts) {
      assert.equal(receipt.policySha, POLICY_SHA);
      assert.match(receipt.targetSha, /^[0-9a-f]{40}$/u);
      assert.match(receipt.policyBlockSha256, /^[0-9a-f]{64}$/u);
    }
  } finally {
    removeFixtureRoot(root);
  }
});

test('stale routing is incomplete and local instructions remain byte-for-byte unchanged', () => {
  const root = makeFixtureRoot();
  try {
    const manifest = pilotManifest();
    const policy = loadRolloutPolicy();
    const project = manifest.projects.find(({ repository }) => repository === 'syllik/syllik');
    const stale = materializeManagedTarget(root, project, manifest, { staleAgents: true });
    const before = readFileSync(stale.agentsPath, 'utf8');
    const receipt = inspectMaterializedTarget({
      repositoryRoot: stale.repositoryRoot,
      project,
      manifest,
      policySha: POLICY_SHA,
      targetSha: stale.targetSha
    });
    const after = readFileSync(stale.agentsPath, 'utf8');

    assert.equal(receipt.outcome, 'incomplete');
    assert.equal(receipt.reason, 'TARGET_STALE');
    assert.equal(receipt.findings.some(({ code }) => code === 'GENERATED_DRIFT'), true);
    assert.equal(after, before);
    assert.match(after, /^# Local instructions/u);
    assert.deepEqual(validateRolloutPolicy(policy, manifest), []);
  } finally {
    removeFixtureRoot(root);
  }
});

test('absent required target is an explicit incomplete receipt', () => {
  const manifest = pilotManifest();
  const policy = loadRolloutPolicy();
  const result = evaluatePilotRollout({
    manifest,
    policy,
    policySha: POLICY_SHA,
    materializeTarget: (project) => project.repository === 'syllik/syllik'
      ? { repositoryRoot: null, targetSha: 'b'.repeat(40), reason: 'TARGET_ABSENT' }
      : { repositoryRoot: null, targetSha: 'c'.repeat(40), reason: 'TARGET_ABSENT' }
  });
  assert.equal(result.passed, false);
  assert.equal(result.receipts.every(({ outcome, reason }) => outcome === 'incomplete' && reason === 'TARGET_ABSENT'), true);
});

test('private-inaccessible required target fails closed without leaking a credential', () => {
  const manifest = pilotManifest();
  const policy = loadRolloutPolicy();
  const result = evaluatePilotRollout({
    manifest,
    policy,
    policySha: POLICY_SHA,
    materializeTarget: () => { throw new Error('authentication failed'); }
  });
  assert.equal(result.passed, false);
  assert.equal(result.receipts.every(({ outcome, reason }) => outcome === 'incomplete' && reason === 'TARGET_PRIVATE_UNAVAILABLE'), true);
  assert.equal(JSON.stringify(result).includes('authentication failed'), false);
});

test('dirty materialized target is incomplete and never treated as rollout proof', () => {
  const root = makeFixtureRoot();
  try {
    const manifest = pilotManifest();
    const project = manifest.projects.find(({ repository }) => repository === 'ChipIn-one/.github');
    const target = materializeManagedTarget(root, project, manifest, { dirty: true });
    const receipt = inspectMaterializedTarget({
      repositoryRoot: target.repositoryRoot,
      project,
      manifest,
      policySha: POLICY_SHA,
      targetSha: target.targetSha
    });
    assert.equal(receipt.outcome, 'incomplete');
    assert.equal(receipt.reason, 'TARGET_WIP');
  } finally {
    removeFixtureRoot(root);
  }
});

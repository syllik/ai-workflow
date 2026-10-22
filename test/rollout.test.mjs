import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { githubAppGitAuthorization } from '../scripts/workspace/github-auth.mjs';
import { renderAgentsBlock, renderProfileNavigation } from '../scripts/workspace/render.mjs';
import { evaluatePilotRollout, inspectMaterializedTarget, loadRolloutPolicy, resolveRolloutProjects, validateRolloutPolicy } from '../scripts/workspace/rollout.mjs';
import { fixtureManifest, git, initFixtureRepo, makeFixtureRoot, removeFixtureRoot } from './helpers.mjs';

const POLICY_SHA = 'a'.repeat(40);

function pilotManifest() {
  const base = fixtureManifest();
  const central = base.projects.find(({ repository }) => repository === 'syllik/ai-workflow');
  const profile = base.projects.find(({ repository }) => repository === 'syllik/syllik');
  const frontend = {
    ...base.projects.find(({ repository }) => repository === 'ChipIn-one/chipin-frontend'),
    contextDependencies: [
      { repository: 'ChipIn-one/chipin-knowledge-base', integrationBranch: 'master', access: 'read-only' }
    ]
  };
  const org = {
    id: 'ChipIn-one/.github',
    repository: 'ChipIn-one/.github',
    localPath: 'products/chipin/.github',
    group: 'products/chipin',
    access: 'managed',
    status: 'active',
    integrationBranch: 'master',
    contextPath: '.ai/context.md'
  };
  const knowledgeBase = {
    id: 'ChipIn-one/chipin-knowledge-base',
    repository: 'ChipIn-one/chipin-knowledge-base',
    localPath: 'products/chipin/chipin-knowledge-base',
    group: 'products/chipin',
    access: 'read-only',
    status: 'active',
    integrationBranch: 'master'
  };
  return fixtureManifest({ projects: [profile, org, frontend, knowledgeBase, central] });
}

function materializeRolloutTarget(root, project, manifest, { staleAgents = false, dirty = false } = {}) {
  const repositoryRoot = path.join(root, project.localPath);
  initFixtureRepo(repositoryRoot, `https://github.com/${project.repository}.git`, project.integrationBranch);
  let agentsPath = null;
  if (project.access === 'managed') {
    mkdirSync(path.join(repositoryRoot, '.ai'), { recursive: true });
    const localPrefix = '# Local instructions\n\nKeep this text unchanged.\n';
    const agentsManifest = staleAgents ? { ...manifest, canonicalRoot: '~/OLD-WORK' } : manifest;
    agentsPath = path.join(repositoryRoot, 'AGENTS.md');
    writeFileSync(agentsPath, localPrefix + renderAgentsBlock(agentsManifest), 'utf8');
    writeFileSync(path.join(repositoryRoot, project.contextPath), '# Project context\n', 'utf8');
    writeFileSync(path.join(repositoryRoot, '.ai/decisions.md'), '# Decisions\n', 'utf8');
    if (project.repository === 'syllik/syllik') {
      writeFileSync(path.join(repositoryRoot, 'AI.md'), renderProfileNavigation(manifest), 'utf8');
    }
  } else {
    mkdirSync(path.join(repositoryRoot, 'common'), { recursive: true });
    writeFileSync(path.join(repositoryRoot, 'common/glossary.md'), '# Glossary\n', 'utf8');
  }
  git(repositoryRoot, 'add', '.');
  git(repositoryRoot, 'commit', '--quiet', '-m', 'rollout target');
  const targetSha = git(repositoryRoot, 'rev-parse', 'HEAD');
  git(repositoryRoot, 'switch', '--quiet', '--detach', targetSha);
  if (dirty) writeFileSync(path.join(repositoryRoot, 'local-wip.txt'), 'wip\n', 'utf8');
  return { repositoryRoot, targetSha, agentsPath };
}

test('rollout policy covers managed consumers plus the required read-only KB dependency', () => {
  const manifest = pilotManifest();
  const policy = loadRolloutPolicy();
  assert.deepEqual(validateRolloutPolicy(policy, manifest), []);
  assert.deepEqual(policy.roots, [
    'syllik/syllik',
    'ChipIn-one/.github',
    'ChipIn-one/chipin-frontend'
  ]);
  assert.deepEqual(policy.authentication.permissions, { contents: 'read' });
});

test('rollout workflow mints private-repository tokens only for trusted master runs', () => {
  const workflow = readFileSync('.github/workflows/routing-rollout.yml', 'utf8');

  assert.match(workflow, /github\.event_name == 'workflow_run'[\s\S]*github\.event\.workflow_run\.event == 'push'/u);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/u);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'master'/u);
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/u);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'[\s\S]*github\.ref == 'refs\/heads\/master'/u);
  assert.match(workflow, /client-id:\s*\$\{\{ secrets\.WORKSPACE_READ_APP_CLIENT_ID \}\}/u);
  assert.match(workflow, /rollout-ci\.mjs auth-scope ChipIn-one/u);
  assert.match(workflow, /repositories:\s*\$\{\{ steps\.rollout-scopes\.outputs\.chipin_one \}\}/u);
  assert.match(workflow, /if:\s*steps\.rollout-scopes\.outputs\.syllik != ''/u);
  assert.match(workflow, /if:\s*steps\.rollout-scopes\.outputs\.chipin_one != ''/u);
  assert.doesNotMatch(workflow, /chipin-frontend|chipin-knowledge-base/u);
  assert.match(workflow, /permission-contents:\s*read/u);
  assert.match(workflow, /persist-credentials:\s*false/u);
});

test('GitHub App installation tokens use x-access-token HTTP Basic auth for Git', () => {
  const token = 'test-installation-token';
  const header = githubAppGitAuthorization(token);
  const encoded = header.replace(/^Authorization: Basic /u, '');
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');

  assert.match(header, /^Authorization: Basic [A-Za-z0-9+/=]+$/u);
  assert.equal(decoded, `x-access-token:${token}`);
  assert.equal(header.includes(token), false);
  assert.throws(() => githubAppGitAuthorization(''), /installation token is required/u);
});

test('rollout policy treats roots as declarative managed consumers', () => {
  const manifest = pilotManifest();
  const policy = loadRolloutPolicy();
  const expanded = { ...policy, roots: [...policy.roots, 'ChipIn-one/chipin-knowledge-base'] };
  const findings = validateRolloutPolicy(expanded, manifest);
  assert.equal(findings.some(({ code }) => code === 'ROLLOUT_ROOT_RECORD_INVALID'), true);
});

test('read-only rollout coverage is derived from the managed root dependency declaration', () => {
  const manifest = pilotManifest();
  const policy = loadRolloutPolicy();
  const projects = resolveRolloutProjects(policy, manifest);
  const knowledgeBase = projects.find(({ repository }) => repository === 'ChipIn-one/chipin-knowledge-base');
  assert.equal(knowledgeBase.access, 'read-only');
  assert.deepEqual(knowledgeBase.requiredBy, ['ChipIn-one/chipin-frontend']);

  const frontend = manifest.projects.find(({ repository }) => repository === 'ChipIn-one/chipin-frontend');
  frontend.contextDependencies[0].access = 'managed';
  const findings = validateRolloutPolicy(policy, manifest);
  assert.equal(findings.some(({ code }) => code === 'ROLLOUT_REQUIRED_CONTEXT_MISMATCH'), true);
});

test('aligned pilot targets produce exact-revision receipts and retries are idempotent', () => {
  const root = makeFixtureRoot();
  try {
    const manifest = pilotManifest();
    const policy = loadRolloutPolicy();
    const materialized = new Map();
    for (const project of resolveRolloutProjects(policy, manifest)) {
      materialized.set(project.repository, materializeRolloutTarget(root, project, manifest));
    }
    const materializeTarget = (project) => materialized.get(project.repository);
    const first = evaluatePilotRollout({ manifest, policy, policySha: POLICY_SHA, materializeTarget });
    const second = evaluatePilotRollout({ manifest, policy, policySha: POLICY_SHA, materializeTarget });

    assert.equal(first.passed, true);
    assert.deepEqual(second, first);
    assert.deepEqual(first.receipts.map(({ repository, access, outcome }) => ({ repository, access, outcome })), [
      { repository: 'syllik/syllik', access: 'managed', outcome: 'complete' },
      { repository: 'ChipIn-one/.github', access: 'managed', outcome: 'complete' },
      { repository: 'ChipIn-one/chipin-frontend', access: 'managed', outcome: 'complete' },
      { repository: 'ChipIn-one/chipin-knowledge-base', access: 'read-only', outcome: 'complete' }
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
    const stale = materializeRolloutTarget(root, project, manifest, { staleAgents: true });
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
  const reasons = Object.fromEntries(result.receipts.map(({ repository, reason }) => [repository, reason]));
  assert.equal(reasons['syllik/syllik'], 'TARGET_PRIVATE_UNAVAILABLE');
  assert.equal(reasons['ChipIn-one/.github'], 'TARGET_PRIVATE_UNAVAILABLE');
  assert.equal(reasons['ChipIn-one/chipin-frontend'], 'TARGET_PRIVATE_UNAVAILABLE');
  assert.equal(reasons['ChipIn-one/chipin-knowledge-base'], 'REQUIRED_CONTEXT_UNAVAILABLE');
  assert.equal(JSON.stringify(result).includes('authentication failed'), false);
});

test('dirty materialized target is incomplete and never treated as rollout proof', () => {
  const root = makeFixtureRoot();
  try {
    const manifest = pilotManifest();
    const project = manifest.projects.find(({ repository }) => repository === 'ChipIn-one/.github');
    const target = materializeRolloutTarget(root, project, manifest, { dirty: true });
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

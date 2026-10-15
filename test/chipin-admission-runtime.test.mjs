import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runChipInAdmission } from '../scripts/workspace/chipin-admission-runner.mjs';

const REV = 'a'.repeat(64);
const manifest = {
  projects: [['chipin-frontend', 'dev', 'managed'], ['chipin-backend', 'develop', 'read-only'],
    ['chipin-knowledge-base', 'master', 'read-only']].map(([repo, integrationBranch, access]) => ({
    repository: `ChipIn-one/${repo}`, integrationBranch, access, status: 'active'
  })),
  gitLifecycle: { repositories: [['chipin-frontend', 'dev'], ['chipin-backend', 'develop'],
    ['chipin-knowledge-base', 'master']].map(([repo, integrationBranch]) => ({
    repository: `ChipIn-one/${repo}`, integrationBranch
  })) }
};

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'admission-integration-'));
  const checkout = path.join(root, 'shared');
  mkdirSync(path.join(checkout, 'automation'), { recursive: true });
  mkdirSync(path.join(root, 'bin'));
  writeFileSync(path.join(checkout, 'package.json'), '{"type":"module"}\n');
  writeFileSync(path.join(checkout, 'automation/issue-admission-preflight.mjs'), `
const args = process.argv.slice(2);
const read = flag => args[args.indexOf(flag) + 1];
const issue = read('--issue');
const pinned = args.includes('--expected-revision') ? read('--expected-revision') : null;
const revision = process.env.FIXTURE_REVISION;
const receipt = {
  contractVersion: 'chipin-issue-admission/v1', status: 'INTAKE_COMPLETE', issue,
  revision, checkedAt: process.env.FIXTURE_EXPIRED ? '2020-01-01T00:00:00.000Z' : new Date().toISOString(),
  blockers: [], project: { number: 5, membershipCount: 1, itemId: 'fake-item', status: 'Todo' }
};
if (pinned && pinned !== revision) receipt.status = 'BLOCKED';
process.stdout.write(JSON.stringify(receipt));
`);
  writeFileSync(path.join(checkout, 'automation/issue-admission-evidence.mjs'), `
export function assertCanonicalReceipt(receipt, { issue, revision }) {
  if (receipt.contractVersion !== 'chipin-issue-admission/v1' || receipt.status !== 'INTAKE_COMPLETE' ||
    receipt.issue !== issue || receipt.revision !== revision || receipt.blockers.length ||
    receipt.project?.number !== 5 || receipt.project?.membershipCount !== 1 ||
    Date.now() - Date.parse(receipt.checkedAt) >= 120000) {
    throw Object.assign(new Error('invalid'), { code: 'INVALID_RECEIPT' });
  }
}
`);
  const gh = path.join(root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node
if (process.env.FIXTURE_GH_ERROR) {
  process.stderr.write('HTTP ' + process.env.FIXTURE_GH_ERROR);
  process.exit(1);
}
if (process.argv[2] !== 'api' || process.argv[3] !== '/repos/ChipIn-one/.github/branches/master' ||
    process.argv[4] !== '--method' || process.argv[5] !== 'GET') process.exit(2);
process.stdout.write(JSON.stringify({ name: 'master', commit: { sha: process.env.FIXTURE_SHA } }));
`, { mode: 0o755 });
  const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
  git('remote', 'add', 'origin', 'https://github.com/ChipIn-one/.github.git');
  git('add', '.'); git('commit', '-qm', 'fixture');
  const sha = git('rev-parse', 'HEAD');
  const env = { ...process.env, PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`,
    FIXTURE_SHA: sha, FIXTURE_REVISION: REV };
  delete env.GITHUB_TOKEN; delete env.GH_TOKEN;
  let out = '', err = '';
  const dependencies = { env, loadManifest: () => manifest,
    stdout: { write: value => { out += value; } },
    stderr: { write: value => { err += value; } } };
  const invoke = async (phase, extra = [], issue = 'ChipIn-one/chipin-frontend#153') => {
    out = ''; err = '';
    const code = await runChipInAdmission([
      '--issue', issue, '--phase', phase, '--shared-source-sha', sha,
      '--shared-checkout', checkout, ...extra
    ], dependencies);
    return { code, result: JSON.parse(out || err) };
  };
  return { root, checkout, sha, env, git, invoke, dependencies,
    close: () => rmSync(root, { recursive: true, force: true }) };
}

test('real command orchestration: missing GITHUB_TOKEN + existing gh -> initial bind then all pinned boundaries', async () => {
  const f = fixture();
  try {
    const binding = path.join(f.root, 'binding.json');
    const first = await f.invoke('initial-bind', ['--binding-output', binding]);
    assert.equal(first.code, 0);
    assert.equal(first.result.status, 'AWAITING_HUMAN_APPROVAL');
    assert.equal(first.result.canonicalStatus, 'INTAKE_COMPLETE');
    const pinned = JSON.parse(readFileSync(binding, 'utf8'));
    assert.equal(pinned.revision, REV);
    assert.equal(pinned.status, 'AWAITING_HUMAN_APPROVAL');
    for (const phase of ['planning', 'executor', 'publisher', 'reviewer', 'correction']) {
      const { code, result } = await f.invoke(phase, ['--expected-revision', REV]);
      assert.equal(code, 0, phase);
      assert.equal(result.status, 'INTAKE_COMPLETE');
      assert.equal(result.integrationBranch, 'dev');
      assert.equal(result.transport, 'authenticated-gh');
    }
    const be = await f.invoke('executor', ['--expected-revision', REV], 'ChipIn-one/chipin-backend#178');
    assert.equal(be.code, 0);
    assert.equal(be.result.integrationBranch, 'develop');
  } finally { f.close(); }
});

test('every later boundary without revision blocks; metadata drift with unchanged Issue timestamp blocks', async () => {
  const f = fixture();
  try {
    for (const phase of ['planning', 'executor', 'publisher', 'reviewer', 'correction']) {
      const { code, result } = await f.invoke(phase);
      assert.equal(code, 2);
      assert.equal(result.diagnostic.code, 'INVALID_ARGUMENTS');
    }
    f.env.FIXTURE_REVISION = 'b'.repeat(64); // models changed Project/native metadata, unchanged updated_at
    const drift = await f.invoke('executor', ['--expected-revision', REV]);
    assert.equal(drift.code, 2);
    assert.equal(drift.result.status, 'BLOCKED');
  } finally { f.close(); }
});

test('wrong SHA, dirty checkout, absent checkout, and wrong origin block before executing shared script', async () => {
  const f = fixture();
  try {
    const extra = ['--expected-revision', REV];
    const stale = await f.invoke('executor', extra);
    assert.equal(stale.code, 0);
    f.env.FIXTURE_SHA = 'b'.repeat(40);
    assert.equal((await f.invoke('executor', extra)).result.diagnostic.code, 'STALE_TRUSTED_SOURCE');
    f.env.FIXTURE_SHA = f.sha;
    writeFileSync(path.join(f.checkout, 'automation/issue-admission-preflight.mjs'), 'process.stdout.write("forged")');
    assert.equal((await f.invoke('executor', extra)).result.diagnostic.code, 'UNTRUSTED_CHECKOUT');
    f.git('checkout', '--', 'automation/issue-admission-preflight.mjs');
    f.git('remote', 'set-url', 'origin', 'https://github.com/evil/repo.git');
    assert.equal((await f.invoke('executor', extra)).result.diagnostic.code, 'UNTRUSTED_CHECKOUT');
    f.git('remote', 'set-url', 'origin', 'https://github.com/ChipIn-one/.github.git');
    const old = f.dependencies.loadManifest;
    assert.equal((await runChipInAdmission(['--issue', 'ChipIn-one/chipin-frontend#1',
      '--phase', 'executor', '--shared-source-sha', f.sha, '--expected-revision', REV,
      '--shared-checkout', path.join(f.root, 'missing')], { ...f.dependencies,
      stdout: { write: () => {} }, stderr: { write: () => {} } })), 2);
    f.dependencies.loadManifest = old;
  } finally { f.close(); }
});

test('denied gh, expired receipt, KB owner and trusted-evidence absence fail closed', async () => {
  const f = fixture();
  try {
    const expected = ['--expected-revision', REV];
    f.env.FIXTURE_GH_ERROR = '403';
    assert.equal((await f.invoke('executor', expected)).result.diagnostic.code, 'PERMISSION_DENIED');
    delete f.env.FIXTURE_GH_ERROR;
    f.env.FIXTURE_EXPIRED = '1';
    assert.equal((await f.invoke('executor', expected)).result.diagnostic.code, 'INVALID_RECEIPT');
    delete f.env.FIXTURE_EXPIRED;
    assert.equal((await f.invoke('executor', expected, 'ChipIn-one/chipin-knowledge-base#5')).result.diagnostic.code, 'OWNER_REQUIRED');
    const { result } = await f.invoke('executor', [...expected, '--transport', 'trusted-evidence']);
    assert.equal(result.diagnostic.code, 'EVIDENCE_UNAVAILABLE');
  } finally { f.close(); }
});

test('trusted evidence consumes prebound complete provenance and rejects unverified copies', async () => {
  const f = fixture();
  try {
    const deps = { ...f.dependencies, consumeTrustedEvidence: async (binding, source) => {
      assert.equal(binding.revision, REV);
      assert.equal(binding.issue, 'ChipIn-one/chipin-frontend#153');
      assert.equal(source.sourceSha, f.sha);
      return { receipt: { contractVersion: 'chipin-issue-admission/v1', status: 'INTAKE_COMPLETE',
        issue: binding.issue, revision: REV, checkedAt: new Date().toISOString(), blockers: [] },
        revision: REV, sourceSha: f.sha, requestId: 'test-request-id-123456',
        runId: 101, attempt: 1, artifactId: 202 };
    } };
    let output = '', error = '';
    deps.stdout = { write: v => { output += v; } };
    deps.stderr = { write: v => { error += v; } };
    const args = ['--issue', 'ChipIn-one/chipin-frontend#153', '--phase', 'reviewer',
      '--shared-source-sha', f.sha, '--expected-revision', REV, '--transport', 'trusted-evidence'];
    assert.equal(await runChipInAdmission(args, deps), 0);
    assert.equal(JSON.parse(output).transport, 'trusted-evidence');
    deps.consumeTrustedEvidence = async () => ({ receipt: { status: 'INTAKE_COMPLETE', issue: 'ChipIn-one/chipin-frontend#153', revision: REV } });
    assert.equal(await runChipInAdmission(args, deps), 2);
    assert.equal(JSON.parse(error).diagnostic.code, 'INVALID_RECEIPT');
  } finally { f.close(); }
});

test('scripts/workspace/cli.mjs admission command invokes the runtime outside resolver unit tests', () => {
  const f = fixture();
  try {
    const root = path.resolve(new URL('..', import.meta.url).pathname);
    const command = ['scripts/workspace/cli.mjs', 'admission', '--issue', 'ChipIn-one/chipin-frontend#153',
      '--phase', 'executor', '--expected-revision', REV, '--shared-source-sha', f.sha,
      '--shared-checkout', f.checkout, '--manifest', path.join(root, 'workspace.yaml')];
    const output = execFileSync(process.execPath, command, { cwd: root, env: f.env, encoding: 'utf8' });
    assert.equal(JSON.parse(output).status, 'INTAKE_COMPLETE');
  } finally { f.close(); }
});

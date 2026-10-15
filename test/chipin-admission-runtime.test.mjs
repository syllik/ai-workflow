import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, utimesSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { runChipInAdmission } from '../scripts/workspace/chipin-admission-runner.mjs';
import { canonicalReplayDirectory, evidenceOptions, openTrustedRegistry, syncReplayDirectory } from '../scripts/workspace/chipin-admission-evidence.mjs';
import { loadCanonicalChipInWorkspace } from '../scripts/workspace/chipin-admission-workspace.mjs';

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
  // Test stand-in: production imports the actual shared consumer from a
  // pinned immutable Git archive, never from an injected receipt callback.
  writeFileSync(path.join(checkout, 'automation/issue-admission-consumer.mjs'), `
export async function consumeAdmissionArtifact(options) {
  const branch = await options.api.request('/repos/ChipIn-one/.github/branches/master');
  if (branch?.commit?.sha !== options.expectedSourceSha ||
      typeof options.downloadZip !== 'function') {
    throw Object.assign(new Error('source'), { code: 'UNTRUSTED_SOURCE' });
  }
  const unique = 'ChipIn-one/.github/' + options.runId + '/1/' + options.expectedRequestId;
  if (!await options.recordConsumed(unique)) {
    throw Object.assign(new Error('replayed'), { code: 'REPLAY' });
  }
  return {
    receipt: { contractVersion: 'chipin-issue-admission/v1', status: 'INTAKE_COMPLETE',
      issue: options.expectedIssue, revision: options.expectedRevision,
      checkedAt: new Date().toISOString(), blockers: [] },
    revision: options.expectedRevision, sourceSha: options.expectedSourceSha,
    requestId: options.expectedRequestId, runId: options.runId,
    attempt: 1, artifactId: options.artifactId
  };
}
`);
  const gh = path.join(root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node
if (process.env.FIXTURE_GH_ERROR) {
  process.stderr.write('HTTP ' + process.env.FIXTURE_GH_ERROR);
  process.exit(1);
}
if (process.argv[2] !== 'api' || process.argv[4] !== '--method' ||
    process.argv[5] !== 'GET' || process.argv[6] !== '--hostname' ||
    process.argv[7] !== 'github.com' || process.env.GH_HOST !== 'github.com') process.exit(2);
const endpoint = process.argv[3];
if (endpoint === '/repos/ChipIn-one/.github/branches/master') {
  process.stdout.write(JSON.stringify({ name: 'master', commit: { sha: process.env.FIXTURE_SHA } }));
} else if (endpoint === '/repos/syllik/ai-workflow/branches/master') {
  process.stdout.write(JSON.stringify({ name: 'master', commit: { sha: process.env.FIXTURE_POLICY_SHA } }));
} else if (endpoint === '/repos/syllik/ai-workflow/contents/workspace.yaml?ref=' + process.env.FIXTURE_POLICY_SHA) {
  const content = process.env.FIXTURE_WORKSPACE_BASE64;
  const bytes = Buffer.from(content, 'base64');
  const sha = require('node:crypto').createHash('sha1').update('blob ' + bytes.length + '\\0').update(bytes).digest('hex');
  process.stdout.write(JSON.stringify({ name: 'workspace.yaml', path: 'workspace.yaml',
    encoding: 'base64', content, size: bytes.length, sha }));
} else {
  process.exit(2);
}
`, { mode: 0o755 });
  const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
  git('remote', 'add', 'origin', 'https://github.com/ChipIn-one/.github.git');
  git('add', '.'); git('commit', '-qm', 'fixture');
  const sha = git('rev-parse', 'HEAD');
  const env = { ...process.env, PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`,
    FIXTURE_SHA: sha, FIXTURE_REVISION: REV,
    FIXTURE_POLICY_SHA: 'b'.repeat(40),
    FIXTURE_WORKSPACE_BASE64: readFileSync(path.join(path.resolve(new URL('..', import.meta.url).pathname), 'workspace.yaml')).toString('base64') };
  delete env.GITHUB_TOKEN; delete env.GH_TOKEN;
  let out = '', err = '';
  const dependencies = { env, loadCanonicalManifest: () => ({ manifest }),
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
    const old = f.dependencies.loadCanonicalManifest;
    assert.equal((await runChipInAdmission(['--issue', 'ChipIn-one/chipin-frontend#1',
      '--phase', 'executor', '--shared-source-sha', f.sha, '--expected-revision', REV,
      '--shared-checkout', path.join(f.root, 'missing')], { ...f.dependencies,
      stdout: { write: () => {} }, stderr: { write: () => {} } })), 2);
    f.dependencies.loadCanonicalManifest = old;
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
    assert.equal(result.diagnostic.code, 'INVALID_ARGUMENTS');
  } finally { f.close(); }
});

test('real CLI uses one stable durable replay registry across phases and HOME overrides', () => {
  const f = fixture();
  const requestId = 'request-id-' + randomUUID().replace(/-/gu, '');
  const unique = 'ChipIn-one/.github/101/1/' + requestId;
  const marker = path.join(canonicalReplayDirectory(), createHash('sha256').update(unique).digest('hex'));
  try {
    const root = path.resolve(new URL('..', import.meta.url).pathname);
    const args = ['scripts/workspace/cli.mjs', 'admission',
      '--issue', 'ChipIn-one/chipin-frontend#153', '--phase', 'reviewer',
      '--expected-revision', REV, '--shared-source-sha', f.sha,
      '--shared-checkout', f.checkout, '--transport', 'trusted-evidence',
      '--evidence-run-id', '101', '--evidence-artifact-id', '202',
      '--evidence-request-id', requestId, '--evidence-producer', 'trusted-bot'];
    f.env.HOME = path.join(f.root, 'home-override-1');
    const stdout = execFileSync(process.execPath, args, {
      cwd: root, env: f.env, encoding: 'utf8'
    });
    assert.equal(JSON.parse(stdout).status, 'INTAKE_COMPLETE');
    assert.equal(JSON.parse(stdout).transport, 'trusted-evidence');
    assert.equal(existsSync(marker), true);
    f.env.HOME = path.join(f.root, 'home-override-2');
    const changedPhase = [...args];
    changedPhase[changedPhase.indexOf('--phase') + 1] = 'executor';
    let blocked;
    try { execFileSync(process.execPath, changedPhase, {
      cwd: root, env: f.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }); } catch (cause) { blocked = JSON.parse(cause.stderr.toString()); }
    assert.equal(blocked?.diagnostic?.code, 'REPLAY');
    assert.throws(() => execFileSync(process.execPath,
      [...args, '--evidence-replay-dir', path.join(f.root, 'fresh')], {
        cwd: root, env: f.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
      }), /Command failed/u);
  } finally {
    rmSync(marker, { force: true });
    f.close();
  }
});
test('checkout mutation after archive extraction cannot change executed preflight', async () => {
  const f = fixture();
  try {
    let out = '', err = '';
    const realRun = promisify(execFile);
    const execute = async (binary, args, opts) => {
      const result = await realRun(binary, args, opts);
      if (binary === 'tar') {
        // Mutate the original checkout after snapshot extraction, before Node runs.
        writeFileSync(path.join(f.checkout, 'automation/issue-admission-preflight.mjs'),
          'process.stdout.write(JSON.stringify({status:"INTAKE_COMPLETE",forged:true}));\\n');
      }
      return result;
    };
    const code = await runChipInAdmission(['--issue', 'ChipIn-one/chipin-frontend#153',
      '--phase', 'executor', '--expected-revision', REV,
      '--shared-source-sha', f.sha, '--shared-checkout', f.checkout],
      { ...f.dependencies, run: execute,
        stdout: { write: value => { out += value; } },
        stderr: { write: value => { err += value; } } });
    assert.equal(code, 0, err);
    const value = JSON.parse(out);
    assert.equal(value.status, 'INTAKE_COMPLETE');
    assert.equal(value.canonicalStatus, 'INTAKE_COMPLETE');
    assert.equal(Object.hasOwn(value, 'forged'), false);
  } finally { f.close(); }
});

test('authenticated gh artifact ZIP preserves raw bytes and decodes JSON metadata separately', async () => {
  const seen = [];
  const raw = Buffer.from([0x50, 0x4b, 0x00, 0xff, 0xfe, 0x80, 0x01, 0x7f]);
  const args = {
    issue: 'ChipIn-one/chipin-frontend#153',
    'expected-revision': REV, 'evidence-run-id': '101',
    'evidence-artifact-id': '202', 'evidence-request-id': 'request-id-test-123456',
    'evidence-producer': 'trusted-bot'
  };
  const options = evidenceOptions({ args, env: {},
    sourceSha: 'a'.repeat(40),
    run: async (command, argv, opts) => {
      assert.equal(command, 'gh');
      seen.push({ url: argv[1], encoding: opts.encoding });
      return { stdout: argv[1].endsWith('/zip') ? raw :
        JSON.stringify({ name: 'master', commit: { sha: 'a'.repeat(40) } }) };
    }
  });
  const zip = await options.downloadZip(202);
  assert.ok(Buffer.isBuffer(zip));
  assert.deepEqual(zip, raw);
  const branch = await options.api.request('/repos/ChipIn-one/.github/branches/master');
  assert.equal(branch.commit.sha, 'a'.repeat(40));
  assert.deepEqual(seen.map(x => x.encoding), ['buffer', 'utf8']);
  await assert.rejects(options.api.request('/repos/ChipIn-one/chipin-frontend/issues/153'),
    { code: 'READ_ONLY_VIOLATION' });
});

test('Git replace refs cannot redirect the authenticated commit snapshot to other source bytes', async () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.checkout, 'automation/issue-admission-preflight.mjs'),
      'process.stdout.write(JSON.stringify({status:"INTAKE_COMPLETE", forged:true}));\\n');
    f.git('add', '.');
    f.git('commit', '-qm', 'forged replacement');
    const substituted = f.git('rev-parse', 'HEAD');
    f.git('reset', '--hard', f.sha);
    f.git('replace', f.sha, substituted);
    const { code, result } = await f.invoke('executor', ['--expected-revision', REV]);
    assert.equal(code, 0, JSON.stringify(result));
    assert.equal(result.status, 'INTAKE_COMPLETE');
    assert.equal(result.canonicalStatus, 'INTAKE_COMPLETE');
    assert.equal(Object.hasOwn(result, 'forged'), false);
  } finally { f.close(); }
});

test('forces github.com even if inherited GH_HOST targets another host', async () => {
  const f = fixture();
  try {
    f.env.GH_HOST = 'host.invalid';
    const { code, result } = await f.invoke('executor', ['--expected-revision', REV]);
    assert.equal(code, 0, JSON.stringify(result));
    assert.equal(result.status, 'INTAKE_COMPLETE');
  } finally { f.close(); }
});

test('checkout local fsmonitor never runs during admission status verification', async () => {
  const f = fixture();
  try {
    const marker = path.join(f.root, 'fsmonitor-ran');
    const script = path.join(f.root, 'hook.sh');
    writeFileSync(script, '#!/bin/sh\\necho executed > "' + marker + '"\\n', { mode: 0o755 });
    f.git('config', '--local', 'core.fsmonitor', script);
    const { code, result } = await f.invoke('executor', ['--expected-revision', REV]);
    assert.equal(code, 0, JSON.stringify(result));
    assert.equal(result.status, 'INTAKE_COMPLETE');
    assert.equal(existsSync(marker), false);
  } finally { f.close(); }
});

test('actual CLI ignores forged workspace locations and reads canonical master metadata', () => {
  const f = fixture();
  try {
    const root = path.resolve(new URL('..', import.meta.url).pathname);
    const forgedPath = path.join(f.root, 'forged-workspace.yaml');
    writeFileSync(forgedPath, 'projects:\n  - repository: ChipIn-one/chipin-frontend\n    status: active\n    integrationBranch: malicious\n');
    const args = ['scripts/workspace/cli.mjs', 'admission', '--issue', 'ChipIn-one/chipin-frontend#153',
      '--phase', 'executor', '--expected-revision', REV, '--shared-source-sha', f.sha,
      '--shared-checkout', f.checkout];
    const good = JSON.parse(execFileSync(process.execPath, args, {
      cwd: root, env: f.env, encoding: 'utf8'
    }));
    assert.equal(good.status, 'INTAKE_COMPLETE');
    assert.equal(good.integrationBranch, 'dev');
    assert.equal(good.policySourceSha, f.env.FIXTURE_POLICY_SHA);
    assert.throws(() => execFileSync(process.execPath, [...args, '--manifest', forgedPath], {
      cwd: root, env: f.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }), /Command failed/u);
    f.env.FIXTURE_WORKSPACE_BASE64 = Buffer.from(readFileSync(forgedPath)).toString('base64');
    let error;
    try { execFileSync(process.execPath, args, { cwd: root, env: f.env, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (cause) { error = JSON.parse(cause.stderr.toString()); }
    assert.equal(error?.diagnostic?.code, 'WORKSPACE_UNAVAILABLE');
  } finally { f.close(); }
});

test('canonical workspace reader fails closed on denied reads and malformed branch SHA', async () => {
  const f = fixture();
  try {
    f.env.FIXTURE_GH_ERROR = '403';
    await assert.rejects(loadCanonicalChipInWorkspace({ env: f.env }), { code: 'PERMISSION_DENIED' });
    delete f.env.FIXTURE_GH_ERROR;
    f.env.FIXTURE_POLICY_SHA = 'invalid';
    await assert.rejects(loadCanonicalChipInWorkspace({ env: f.env }), { code: 'WORKSPACE_UNAVAILABLE' });
  } finally { f.close(); }
});

test('replay directory sync flushes and closes the directory handle', async () => {
  const calls = [];
  await syncReplayDirectory('/trusted/replay', async (directory, mode) => {
    calls.push(['open', directory, mode]);
    return {
      sync: async () => { calls.push(['fsync']); },
      close: async () => { calls.push(['close']); }
    };
  });
  assert.deepEqual(calls, [['open', '/trusted/replay', 'r'], ['fsync'], ['close']]);
  const failed = [];
  await assert.rejects(syncReplayDirectory('/trusted/replay', async () => ({
    sync: async () => { failed.push('fsync'); throw new Error('disk unavailable'); },
    close: async () => { failed.push('close'); }
  })), /disk unavailable/u);
  assert.deepEqual(failed, ['fsync', 'close']);
});

test('registry recovery re-syncs existing ancestors after a previous fsync failure', async () => {
  const flushed = [];
  await assert.rejects(openTrustedRegistry(async () => {
    throw new Error('simulated interrupted fsync');
  }), { code: 'REPLAY_REGISTRY_UNAVAILABLE' });
  const registry = await openTrustedRegistry(async directory => {
    flushed.push(directory);
    await syncReplayDirectory(directory);
  });
  assert.equal(registry, canonicalReplayDirectory());
  assert.ok(flushed.includes(registry));
  assert.ok(flushed.includes(path.dirname(registry)));
  assert.ok(flushed.includes(path.dirname(path.dirname(registry))));
});

test('checkout-defined clean filters never run when tracked files are stat-dirty', async () => {
  const f = fixture();
  try {
    const marker = path.join(f.root, 'clean-filter-ran');
    const filter = path.join(f.root, 'clean-filter.sh');
    writeFileSync(filter, '#!/bin/sh\necho executed > "' + marker + '"\ncat\n', { mode: 0o755 });
    f.git('config', '--local', 'filter.untrusted.clean', filter);
    writeFileSync(path.join(f.checkout, '.gitattributes'),
      'automation/issue-admission-preflight.mjs filter=untrusted\n');
    const tracked = path.join(f.checkout, 'automation/issue-admission-preflight.mjs');
    const touched = new Date(Date.now() - 60_000);
    utimesSync(tracked, touched, touched);
    const allowed = await f.invoke('executor', ['--expected-revision', REV]);
    assert.equal(allowed.code, 0, JSON.stringify(allowed.result));
    assert.equal(allowed.result.status, 'INTAKE_COMPLETE');
    assert.equal(existsSync(marker), false);
    // Real tracked byte drift still blocks; no Git clean filter is invoked.
    writeFileSync(tracked, 'process.stdout.write("forged")');
    const blocked = await f.invoke('executor', ['--expected-revision', REV]);
    assert.equal(blocked.result.diagnostic.code, 'UNTRUSTED_CHECKOUT');
    assert.equal(existsSync(marker), false);
  } finally { f.close(); }
});

test('every checkout Git object read including archive forbids lazy fetch', async () => {
  const f = fixture();
  try {
    let out = '', err = '', gitInvocations = 0;
    const execute = promisify(execFile);
    const run = async (command, argv, opts) => {
      if (command === 'git') {
        gitInvocations++;
        assert.equal(opts.env?.GIT_NO_LAZY_FETCH, '1');
        assert.equal(opts.env?.GIT_NO_REPLACE_OBJECTS, '1');
      }
      return execute(command, argv, opts);
    };
    const code = await runChipInAdmission([
      '--issue', 'ChipIn-one/chipin-frontend#153', '--phase', 'executor',
      '--expected-revision', REV, '--shared-source-sha', f.sha,
      '--shared-checkout', f.checkout
    ], { ...f.dependencies, run, stdout: { write: x => { out += x; } },
      stderr: { write: x => { err += x; } } });
    assert.equal(code, 0, err);
    assert.equal(JSON.parse(out).status, 'INTAKE_COMPLETE');
    assert.ok(gitInvocations >= 6, 'must cover both tree/index reads and archive');
  } finally { f.close(); }
});

test('missing promisor blob fails closed without invoking external object helper', async () => {
  const f = fixture();
  try {
    const marker = path.join(f.root, 'lazy-helper-ran');
    const helper = path.join(f.root, 'lazy-helper.sh');
    writeFileSync(helper, '#!/bin/sh\necho executed > "' + marker + '"\nexit 9\n', { mode: 0o755 });
    const staged = f.git('ls-files', '--stage', 'automation/issue-admission-preflight.mjs');
    const oid = staged.match(/\b[a-f0-9]{40}\b/u)?.[0];
    assert.ok(oid, staged);
    const loose = path.join(f.checkout, '.git', 'objects', oid.slice(0, 2), oid.slice(2));
    assert.equal(existsSync(loose), true);
    f.git('config', 'core.repositoryformatversion', '1');
    f.git('config', 'extensions.partialclone', 'malicious');
    f.git('config', 'remote.malicious.promisor', 'true');
    f.git('config', 'remote.malicious.url', 'ext::' + helper);
    f.git('config', 'protocol.ext.allow', 'always');
    rmSync(loose);
    const { code, result } = await f.invoke('executor', ['--expected-revision', REV]);
    assert.equal(code, 2, JSON.stringify(result));
    assert.equal(result.diagnostic.code, 'UNTRUSTED_CHECKOUT');
    assert.equal(existsSync(marker), false);
  } finally { f.close(); }
});

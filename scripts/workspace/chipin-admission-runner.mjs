// Executable pre-PR boundary. Canonical reads and evidence verification remain
// exclusively in the pinned ChipIn-one/.github implementation.
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile, readlink, mkdtemp, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveChipInAdmissionRoute } from './chipin-admission-route.mjs';
import { evidenceOptions } from './chipin-admission-evidence.mjs';
import { loadCanonicalChipInWorkspace } from './chipin-admission-workspace.mjs';

const execFile = promisify(execFileCallback);
const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const PHASES = new Set(['initial-bind', 'planning', 'executor', 'publisher', 'reviewer', 'correction']);
const CODES = new Set(['AUTH_UNAVAILABLE', 'PERMISSION_DENIED', 'SCHEMA_UNREADABLE',
  'PROJECT_UNREADABLE', 'NATIVE_ISSUE_UNREADABLE', 'STALE_REVISION', 'STALE_RECEIPT',
  'RETRY_EXHAUSTED', 'ADMISSION_BLOCKED', 'INVALID_RECEIPT', 'UNTRUSTED_EVIDENCE',
  'UNTRUSTED_SOURCE', 'UNTRUSTED_RUN', 'UNTRUSTED_ARTIFACT', 'REPLAY', 'TRUST_CONTEXT_MISSING',
  'REPLAY_REGISTRY_UNAVAILABLE', 'REPLAY_REGISTRY_UNTRUSTED', 'READ_ONLY_VIOLATION']);
const ORIGIN = /^((https:\/\/github\.com\/)|(git@github\.com:))ChipIn-one\/\.github(?:\.git)?\/?$/iu;
const BRANCH = '/repos/ChipIn-one/.github/branches/master';

function failure(code, capability, remedy) {
  return { status: 'BLOCKED', diagnostic: { code, principal: 'existing-authorized-principal',
    transport: 'read-only', capability, remedy } };
}

function parseArgs(argv) {
  const allowed = new Set(['issue', 'phase', 'expected-revision', 'shared-source-sha',
    'shared-checkout', 'owner', 'binding-output', 'transport',
    'evidence-run-id', 'evidence-artifact-id', 'evidence-request-id', 'evidence-producer']);
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]?.startsWith('--') ? argv[i].slice(2) : '';
    if (!allowed.has(k) || Object.hasOwn(values, k) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error('INVALID_ARGUMENTS');
    }
    values[k] = argv[i + 1];
  }
  if (!values.issue || !PHASES.has(values.phase) || !SHA40.test(values['shared-source-sha'] ?? '') ||
      !['direct', 'trusted-evidence'].includes(values.transport ?? 'direct') ||
      !values['shared-checkout'] ||
      (values.transport === 'trusted-evidence' ?
        !['evidence-run-id', 'evidence-artifact-id', 'evidence-request-id', 'evidence-producer',
          ].every(key => Boolean(values[key])) :
        ['evidence-run-id', 'evidence-artifact-id', 'evidence-request-id', 'evidence-producer',
          ].some(key => Object.hasOwn(values, key))) ||
      (values.phase === 'initial-bind' ? Boolean(values['expected-revision']) || !values['binding-output'] :
        !SHA256.test(values['expected-revision'] ?? '') || Boolean(values['binding-output'])) ||
      (values.transport === 'trusted-evidence' && values.phase === 'initial-bind')) {
    throw new Error('INVALID_ARGUMENTS');
  }
  return values;
}

function normalizeFailure(cause, capability) {
  const raw = String(cause?.stderr ?? '');
  if (/HTTP 401|HTTP 403|\b401\b|\b403\b/u.test(raw) || [401, 403].includes(cause?.status)) {
    return failure('PERMISSION_DENIED', capability, 'Existing principal needs native Issue, org Issue Fields and Project #5 read access.');
  }
  if (cause?.code === 'ENOENT') {
    return failure('AUTH_UNAVAILABLE', capability, 'Use an already-authenticated gh CLI or an approved existing credential.');
  }
  return failure('TRANSPORT_ERROR', capability, 'Check the existing read-only transport; do not provision a new secret.');
}

/** Fixed read-only endpoint, no credential extraction or logging. */
function makeBranchRead({ env, run = execFile, fetchImpl = fetch }) {
  return { request: async (endpoint, options = {}) => {
    if (endpoint !== BRANCH || options.method !== 'GET' || options.body !== undefined) {
      throw Object.assign(new Error('READ_ONLY_VIOLATION'), { code: 'READ_ONLY_VIOLATION' });
    }
    if (typeof env.GITHUB_TOKEN === 'string' && env.GITHUB_TOKEN.length > 0) {
      try {
        const response = await fetchImpl(`https://api.github.com${BRANCH}`, {
          method: 'GET', headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${env.GITHUB_TOKEN}` },
          signal: AbortSignal.timeout(20_000)
        });
        if (!response.ok) {
          const error = Object.assign(new Error('unreadable'), { code: [401, 403].includes(response.status) ? 'PERMISSION_DENIED' : 'TRANSPORT_ERROR' });
          throw error;
        }
        return await response.json();
      } catch (cause) {
        if (cause?.code === 'PERMISSION_DENIED') throw cause;
        throw Object.assign(new Error('read failed'), { code: 'TRANSPORT_ERROR' });
      }
    }
    try {
      const { stdout } = await run('gh', ['api', BRANCH, '--method', 'GET', '--hostname', 'github.com'], {
        env: { ...env, GH_HOST: 'github.com' }, timeout: 20_000, maxBuffer: 1_048_576
      });
      return JSON.parse(stdout);
    } catch (cause) {
      const value = normalizeFailure(cause, 'authenticated shared master ref GET');
      throw Object.assign(new Error(value.diagnostic.code), { code: value.diagnostic.code });
    }
  } };
}

/** Compare tracked checkout bytes to the authenticated commit without calling
 * git status/diff: these can execute checkout-defined clean filter commands.
 * Executable source remains pinned to the separately archived commit object. */
async function unchangedTrackedFiles(directory, sha, git) {
  const tree = (await git('ls-tree', '-r', '-z', '--full-tree', sha)).split('\0').filter(Boolean);
  const index = (await git('ls-files', '--stage', '-z')).split('\0').filter(Boolean);
  if (tree.length === 0 || tree.length !== index.length) return false;
  const staged = new Map();
  for (const row of index) {
    const matched = /^(100644|100755|120000) ([a-f0-9]{40}) 0\t([^\0]+)$/u.exec(row);
    if (!matched || staged.has(matched[3])) return false;
    staged.set(matched[3], { mode: matched[1], oid: matched[2] });
  }
  for (const row of tree) {
    const matched = /^(100644|100755|120000) blob ([a-f0-9]{40})\t([^\0]+)$/u.exec(row);
    if (!matched) return false;
    const [, mode, oid, name] = matched;
    const item = staged.get(name);
    if (!item || item.mode !== mode || item.oid !== oid) return false;
    const absolute = path.resolve(directory, name);
    if (!absolute.startsWith(directory + path.sep)) return false;
    const meta = await lstat(absolute);
    if (mode === '120000' ? !meta.isSymbolicLink() : !meta.isFile()) return false;
    if (mode !== '120000' && (Boolean(meta.mode & 0o111) !== (mode === '100755'))) return false;
    const bytes = mode === '120000' ? Buffer.from(await readlink(absolute)) : await readFile(absolute);
    const header = Buffer.from('blob ' + bytes.length + '\0');
    if (createHash('sha1').update(header).update(bytes).digest('hex') !== oid) return false;
  }
  return true;
}

async function trustedCheckout(root, sha, { run = execFile } = {}) {
  if (!root || !SHA40.test(sha ?? '')) return null;
  try {
    const directory = await realpath(path.resolve(root));
    // These local reads never need admission credentials or checkout hooks.
    // Suppress repository/global configuration capable of executing helper commands.
    const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      !/^(?:GIT_|GH_|GITHUB_TOKEN$|SSH_ASKPASS$)/u.test(key)));
    Object.assign(gitEnv, { GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_TERMINAL_PROMPT: '0' });
    async function git(...args) {
      const { stdout } = await run('git', ['--no-replace-objects', '-c', 'core.fsmonitor=false',
        '-c', 'core.hooksPath=/dev/null', '-C', directory, ...args], {
        env: gitEnv, timeout: 5000, maxBuffer: 1_048_576
      });
      return stdout.trim();
    }
    const top = await git('rev-parse', '--show-toplevel');
    const origin = await git('config', '--get', 'remote.origin.url');
    const tracked = await git('ls-files', '--error-unmatch', 'automation/issue-admission-preflight.mjs',
      'automation/issue-admission-evidence.mjs');
    const head = await git('rev-parse', '--verify', 'HEAD^{commit}');
    if (path.resolve(top) !== directory || !ORIGIN.test(origin) || head !== sha ||
        !tracked.includes('automation/issue-admission-preflight.mjs')) return null;
    if (!await unchangedTrackedFiles(directory, sha, git)) return null;
    return directory;
  } catch { return null; }
}

/**
 * Export exactly the authenticated shared commit to a private snapshot.
 * Git archive reads immutable commit objects, never mutable checkout files.
 * Both direct preflight and verified consumer execute only snapshot bytes.
 */
async function trustedSnapshot(root, sha, { run = execFile } = {}) {
  const checkout = await trustedCheckout(root, sha, { run });
  if (!checkout) return null;
  const snapshot = await mkdtemp(path.join(tmpdir(), 'chipin-admission-'));
  try {
    const { stdout: archive } = await run('git',
      ['--no-replace-objects', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null',
        '-C', checkout, 'archive', '--format=tar', sha],
      { env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) =>
        !/^(?:GIT_|GH_|GITHUB_TOKEN$|SSH_ASKPASS$)/u.test(key))),
        GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
        timeout: 10_000, maxBuffer: 32 * 1024 * 1024, encoding: 'buffer' });
    if (!Buffer.isBuffer(archive) || archive.length === 0) throw new Error('ARCHIVE_UNAVAILABLE');
    const tarPath = path.join(snapshot, 'source.tar');
    await writeFile(tarPath, archive, { flag: 'wx', mode: 0o600 });
    await run('tar', ['-xf', tarPath, '-C', snapshot, '--no-same-owner', '--no-same-permissions'],
      { timeout: 10_000, maxBuffer: 1_048_576 });
    await unlink(tarPath);
    return snapshot;
  } catch {
    await rm(snapshot, { recursive: true, force: true });
    return null;
  }
}

/** Output is a fresh canonical receipt, never an authorization to implement/publish. */
export async function runChipInAdmission(argv, dependencies = {}) {
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  const env = dependencies.env ?? process.env;
  const run = dependencies.run ?? execFile;
  const emit = result => {
    (result.status === 'BLOCKED' ? stderr : stdout).write(`${JSON.stringify(result)}\n`);
    return result.status === 'BLOCKED' ? 2 : 0;
  };
  let args;
  try { args = parseArgs(argv); }
  catch { return emit(failure('INVALID_ARGUMENTS', 'admission CLI arguments',
    'Specify --issue, --phase, --shared-source-sha and either --shared-checkout (direct) or trusted-evidence; initial-bind requires --binding-output.')); }
  let manifest;
  let policySourceSha = null;
  try {
    // An injected loader is available only to direct unit fixtures; the real CLI
    // always reads the authenticated canonical master workspace via GitHub.
    const source = typeof dependencies.loadCanonicalManifest === 'function'
      ? await dependencies.loadCanonicalManifest()
      : await loadCanonicalChipInWorkspace({ env, run, fetchImpl: dependencies.fetchImpl });
    manifest = source.manifest;
    policySourceSha = source.policySourceSha ?? null;
  } catch (cause) {
    const code = ['AUTH_UNAVAILABLE', 'PERMISSION_DENIED'].includes(cause?.code)
      ? cause.code : 'WORKSPACE_UNAVAILABLE';
    return emit(failure(code, 'authenticated canonical ai-workflow workspace.yaml',
      'Read syllik/ai-workflow master workspace.yaml using existing authorized GitHub credentials.'));
  }

  const evidence = args.transport === 'trusted-evidence';
  const route = await resolveChipInAdmissionRoute({
    manifest, issue: args.issue, selectedOwner: args.owner ?? null,
    phase: args.phase, expectedRevision: args['expected-revision'] ?? null,
    sharedSourceSha: args['shared-source-sha'],
    authenticatedGitHubRead: dependencies.authenticatedGitHubRead ?? makeBranchRead({ env, run, fetchImpl: dependencies.fetchImpl }),
    capabilities: evidence
      ? { authorizedEvidenceDelivery: true, authenticatedArtifactRead: true, durableReplayRegistry: true }
      : { approvedCredential: Boolean(env.GITHUB_TOKEN), authenticatedGh: !env.GITHUB_TOKEN }
  });
  if (route.status !== 'PENDING_VERIFICATION') return emit(route);

  const snapshot = await trustedSnapshot(args['shared-checkout'], route.shared.sourceSha, { run });
  if (!snapshot) return emit(failure('UNTRUSTED_CHECKOUT', 'immutable trusted .github commit snapshot',
    'Require exact authenticated master commit, origin and matching tracked checkout bytes without executing Git worktree filters.'));

  if (evidence) {
    try {
      // Shared verifier, NOT an injected receipt-producing callback. All run,
      // artifact, digest, source, full-revision and replay checks remain in .github.
      const { consumeAdmissionArtifact } = await import(pathToFileURL(path.join(snapshot,
        'automation/issue-admission-consumer.mjs')).href);
      const verified = await consumeAdmissionArtifact(evidenceOptions({
        args, env, run, fetchImpl: dependencies.fetchImpl, sourceSha: route.shared.sourceSha
      }));
      if (verified?.receipt?.contractVersion !== 'chipin-issue-admission/v1' ||
          verified.receipt.status !== 'INTAKE_COMPLETE' || verified.receipt.issue !== args.issue ||
          !Array.isArray(verified.receipt.blockers) || verified.receipt.blockers.length !== 0 ||
          verified.receipt.revision !== args['expected-revision'] ||
          verified.revision !== args['expected-revision'] || verified.sourceSha !== route.shared.sourceSha ||
          !Number.isSafeInteger(verified.runId) || verified.runId < 1 ||
          !Number.isSafeInteger(verified.attempt) || verified.attempt < 1 ||
          !Number.isSafeInteger(verified.artifactId) || verified.artifactId < 1 ||
          typeof verified.requestId !== 'string' || verified.requestId.length < 16 ||
          !Number.isFinite(Date.parse(verified.receipt.checkedAt)) ||
          Date.now() - Date.parse(verified.receipt.checkedAt) >= 120_000 ||
          Date.parse(verified.receipt.checkedAt) > Date.now()) {
        return emit(failure('INVALID_RECEIPT', 'verified trusted evidence',
          'Require a fresh shared consumer result for the approved exact revision.'));
      }
      return emit({ status: 'INTAKE_COMPLETE', issue: args.issue, phase: args.phase,
        revision: verified.receipt.revision, integrationBranch: route.integrationBranch,
        transport: 'trusted-evidence', checkedAt: verified.receipt.checkedAt });
    } catch (cause) {
      return emit(failure(CODES.has(cause?.code) ? cause.code : 'EVIDENCE_UNAVAILABLE',
        'shared trusted artifact consumer',
        'Check authenticated producer/run/ref/artifact/digest/revision/replay bindings.'));
    } finally {
      await rm(snapshot, { recursive: true, force: true });
    }
  }

  let receipt;
  try {
    const { stdout: output } = await run(process.execPath, [route.entrypoint, ...route.args], {
      cwd: snapshot, env: { ...env, GH_HOST: 'github.com' }, timeout: 45_000, maxBuffer: 1_048_576
    });
    receipt = JSON.parse(output);
    // Import from the same immutable shared snapshot used by the subprocess.
    const { assertCanonicalReceipt } = await import(pathToFileURL(path.join(snapshot,
      'automation/issue-admission-evidence.mjs')).href);
    assertCanonicalReceipt(receipt, { issue: args.issue,
      revision: args.phase === 'initial-bind' ? receipt.revision : args['expected-revision'] });
  } catch (cause) {
    let code = CODES.has(cause?.code) ? cause.code : 'ADMISSION_BLOCKED';
    if (typeof cause?.stderr === 'string') {
      try {
        const fromShared = JSON.parse(cause.stderr.trim().split('\n').at(-1));
        if (fromShared?.status === 'BLOCKED' && CODES.has(fromShared?.diagnostic?.code)) {
          code = fromShared.diagnostic.code;
        }
      } catch { /* Unstructured subprocess output is never exposed. */ }
    }
    return emit(failure(code, 'shared immutable canonical preflight',
    'Investigate redacted shared preflight blockers; do not accept pending routes or repair Issue metadata.'));
  } finally {
    await rm(snapshot, { recursive: true, force: true });
  }
  if (!SHA256.test(receipt.revision ?? '')) {
    return emit(failure('INVALID_RECEIPT', 'full canonical revision', 'Canonical read must provide exact 64-hex revision.'));
  }
  if (args.phase === 'initial-bind') {
    try {
      // Exclusive creation prevents a new read silently replacing a previously
      // reviewed/approved revision. Human approval is a separate explicit gate.
      await writeFile(path.resolve(args['binding-output']), JSON.stringify({
        issue: args.issue, revision: receipt.revision, checkedAt: receipt.checkedAt,
        trustedSourceSha: route.shared.sourceSha, policySourceSha, status: 'AWAITING_HUMAN_APPROVAL'
      }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    } catch {
      return emit(failure('BINDING_WRITE_BLOCKED', 'new immutable revision-binding record',
        'Choose a new output path and approve its exact revision with the task; never overwrite prior approval.'));
    }
  }
  return emit({ status: args.phase === 'initial-bind' ? 'AWAITING_HUMAN_APPROVAL' : 'INTAKE_COMPLETE',
    canonicalStatus: 'INTAKE_COMPLETE', phase: args.phase, issue: args.issue,
    revision: receipt.revision, checkedAt: receipt.checkedAt,
    repository: route.repository, integrationBranch: route.integrationBranch,
    transport: route.transport, sharedSourceSha: route.shared.sourceSha, policySourceSha });
}

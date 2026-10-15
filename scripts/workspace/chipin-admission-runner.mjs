// Executable pre-PR boundary. Canonical reads and evidence verification remain
// exclusively in the pinned ChipIn-one/.github implementation.
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveChipInAdmissionRoute } from './chipin-admission-route.mjs';

const execFile = promisify(execFileCallback);
const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const PHASES = new Set(['initial-bind', 'planning', 'executor', 'publisher', 'reviewer', 'correction']);
const CODES = new Set(['AUTH_UNAVAILABLE', 'PERMISSION_DENIED', 'SCHEMA_UNREADABLE',
  'PROJECT_UNREADABLE', 'NATIVE_ISSUE_UNREADABLE', 'STALE_REVISION', 'STALE_RECEIPT',
  'RETRY_EXHAUSTED', 'ADMISSION_BLOCKED', 'INVALID_RECEIPT', 'UNTRUSTED_EVIDENCE',
  'UNTRUSTED_SOURCE', 'UNTRUSTED_RUN', 'UNTRUSTED_ARTIFACT', 'REPLAY', 'TRUST_CONTEXT_MISSING']);
const ORIGIN = /^((https:\/\/github\.com\/)|(git@github\.com:))ChipIn-one\/\.github(?:\.git)?\/?$/iu;
const BRANCH = '/repos/ChipIn-one/.github/branches/master';

function failure(code, capability, remedy) {
  return { status: 'BLOCKED', diagnostic: { code, principal: 'existing-authorized-principal',
    transport: 'read-only', capability, remedy } };
}

function parseArgs(argv) {
  const allowed = new Set(['issue', 'phase', 'expected-revision', 'shared-source-sha',
    'shared-checkout', 'owner', 'manifest', 'binding-output', 'transport']);
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
      (values.transport !== 'trusted-evidence' && !values['shared-checkout']) ||
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
      const { stdout } = await run('gh', ['api', BRANCH, '--method', 'GET'], {
        env, timeout: 20_000, maxBuffer: 1_048_576
      });
      return JSON.parse(stdout);
    } catch (cause) {
      const value = normalizeFailure(cause, 'authenticated shared master ref GET');
      throw Object.assign(new Error(value.diagnostic.code), { code: value.diagnostic.code });
    }
  } };
}

async function trustedCheckout(root, sha, { run = execFile } = {}) {
  if (!root || !SHA40.test(sha ?? '')) return null;
  try {
    const directory = await realpath(path.resolve(root));
    async function git(...args) {
      const { stdout } = await run('git', ['-C', directory, ...args], {
        timeout: 5000, maxBuffer: 1_048_576
      });
      return stdout.trim();
    }
    const top = await git('rev-parse', '--show-toplevel');
    const origin = await git('config', '--get', 'remote.origin.url');
    const tracked = await git('ls-files', '--error-unmatch', 'automation/issue-admission-preflight.mjs',
      'automation/issue-admission-evidence.mjs');
    const changes = await git('status', '--porcelain', '--untracked-files=all');
    // HEAD is deliberately the final check before the trusted subprocess launch.
    const head = await git('rev-parse', '--verify', 'HEAD^{commit}');
    if (path.resolve(top) !== directory || !ORIGIN.test(origin) || head !== sha || changes !== '' ||
        !tracked.includes('automation/issue-admission-preflight.mjs')) return null;
    return directory;
  } catch { return null; }
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
  try {
    if (typeof dependencies.loadManifest !== 'function') throw new Error('missing loader');
    manifest = dependencies.loadManifest(path.resolve(args.manifest ?? 'workspace.yaml'));
  } catch { return emit(failure('WORKSPACE_UNAVAILABLE', 'canonical workspace.yaml', 'Supply an existing canonical workspace manifest.')); }

  const evidence = args.transport === 'trusted-evidence';
  if (evidence && typeof dependencies.consumeTrustedEvidence !== 'function') {
    return emit(failure('EVIDENCE_UNAVAILABLE', 'authenticated trusted artifact consumer',
      'Use a separately authorized producer/consumer with authenticated artifact read and durable replay; Executor cannot dispatch.'));
  }
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

  if (evidence) {
    try {
      // The trusted caller must invoke the shared consumeAdmissionArtifact(), not
      // return a copy of a receipt. CLI has no such capability by default.
      const verified = await dependencies.consumeTrustedEvidence(route.requiredBinding, route.shared);
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
        return emit(failure('INVALID_RECEIPT', 'verified trusted evidence', 'Require a fresh shared consumer result for the approved exact revision.'));
      }
      return emit({ status: 'INTAKE_COMPLETE', issue: args.issue, phase: args.phase,
        revision: verified.receipt.revision, integrationBranch: route.integrationBranch,
        transport: 'trusted-evidence', checkedAt: verified.receipt.checkedAt });
    } catch (cause) {
      return emit(failure(CODES.has(cause?.code) ? cause.code : 'EVIDENCE_UNAVAILABLE', 'trusted artifact consumer',
        'Check independently authenticated producer/run/ref/artifact/digest/revision/replay bindings.'));
    }
  }

  // Immediate origin/HEAD/worktree pin before executing any shared code.
  const checkout = await trustedCheckout(args['shared-checkout'], route.shared.sourceSha, { run });
  if (!checkout) return emit(failure('UNTRUSTED_CHECKOUT', 'exact clean trusted .github checkout',
    'Require ChipIn-one/.github origin, clean tracked tree and HEAD matching authenticated master SHA.'));
  let receipt;
  try {
    const { stdout: output } = await run(process.execPath, [route.entrypoint, ...route.args], {
      cwd: checkout, env, timeout: 45_000, maxBuffer: 1_048_576
    });
    receipt = JSON.parse(output);
    // Import only from the checkout verified immediately above. The shared
    // validator, not this router, defines the receipt contract and freshness.
    const { assertCanonicalReceipt } = await import(pathToFileURL(path.join(checkout,
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
        trustedSourceSha: route.shared.sourceSha, status: 'AWAITING_HUMAN_APPROVAL'
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
    transport: route.transport, sharedSourceSha: route.shared.sourceSha });
}

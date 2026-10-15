// Routing only: ChipIn-one/.github owns canonical admission and evidence verification.
const ISSUE = /^(ChipIn-one\/(?:chipin-frontend|chipin-backend|chipin-knowledge-base))#([1-9]\d*)$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SHA40 = /^[a-f0-9]{40}$/u;
const SHARED_REPOSITORY = 'ChipIn-one/.github';
const PREFLIGHT = 'automation/issue-admission-preflight.mjs';
const CONSUMER = 'automation/issue-admission-consumer.mjs';
const PHASES = new Set(['initial-bind', 'planning', 'executor', 'publisher', 'reviewer', 'correction']);

function blocked(code, capability, remedy) {
  return { status: 'BLOCKED', diagnostic: { code, principal: 'existing-authorized-principal',
    transport: 'unresolved', capability, remedy } };
}

/**
 * This is a route, not authorization. Only an explicit initial-bind phase may
 * discover the canonical revision; every other handoff must pin the approved
 * full revision and obtain a NEW shared canonical read-back.
 */
export async function resolveChipInAdmissionRoute({ manifest, issue, selectedOwner = null,
  phase = 'executor', expectedRevision = null, sharedSourceSha, authenticatedGitHubRead, capabilities = {} } = {}) {
  const match = ISSUE.exec(issue ?? '');
  if (!match) return blocked('INVALID_ISSUE', 'exact ChipIn Issue identity', 'Supply one explicit FE/BE/KB Issue; do not discover repositories.');
  if (!PHASES.has(phase)) return blocked('INVALID_PHASE', 'explicit admission handoff phase', 'Choose initial-bind, planning, executor, publisher, reviewer or correction.');
  if (phase === 'initial-bind' ? expectedRevision !== null : !SHA256.test(expectedRevision ?? '')) {
    return blocked('INVALID_REVISION', 'approved full canonical revision',
      'Only initial-bind may omit the revision; each later handoff requires a human-approved 64-hex pin.');
  }
  if (!SHA40.test(sharedSourceSha ?? '')) return blocked('UNTRUSTED_SOURCE', 'pinned shared master SHA', 'Resolve the current ChipIn-one/.github master explicitly.');
  if (match[1] !== 'ChipIn-one/chipin-knowledge-base' && selectedOwner !== null) {
    return blocked('OWNER_OVERRIDE_FORBIDDEN', 'fixed FE/BE native owner', 'FE uses syllik and BE uses olegbal; only KB accepts --owner.');
  }
  if (match[1] === 'ChipIn-one/chipin-knowledge-base' &&
      (typeof selectedOwner !== 'string' || !/^[a-z\d](?:[a-z\d-]{0,37})$/iu.test(selectedOwner))) {
    return blocked('OWNER_REQUIRED', 'explicit KB owner', 'Choose the KB native owner explicitly; never infer it from Issue body.');
  }
  const records = manifest?.projects?.filter(p => p?.repository === match[1]);
  if (!Array.isArray(records) || records.length !== 1 || records[0]?.status !== 'active' ||
      !['managed', 'read-only'].includes(records[0]?.access) ||
      typeof records[0]?.integrationBranch !== 'string' || !records[0].integrationBranch) {
    return blocked('WORKSPACE_UNAVAILABLE', 'exact active workspace project', 'Select exactly one declared workspace.yaml project record.');
  }
  const record = records[0];
  const lifecycle = manifest?.gitLifecycle?.repositories?.filter(p => p?.repository === match[1]);
  if (!Array.isArray(lifecycle) || lifecycle.length !== 1 || lifecycle[0].integrationBranch !== record.integrationBranch) {
    return blocked('BRANCH_MISMATCH', 'declared integrationBranch', 'Resolve branch from the same workspace.yaml record and lifecycle mapping.');
  }
  if (!authenticatedGitHubRead || typeof authenticatedGitHubRead.request !== 'function') {
    return blocked('AUTH_UNAVAILABLE', 'authenticated shared master ref read',
      'Use the existing approved credential or authorized gh api read-only transport.');
  }
  let current;
  try {
    current = await authenticatedGitHubRead.request('/repos/ChipIn-one/.github/branches/master', { method: 'GET' });
  } catch (cause) {
    const code = ['AUTH_UNAVAILABLE', 'PERMISSION_DENIED', 'TRANSPORT_ERROR'].includes(cause?.code)
      ? cause.code : 'SHARED_REF_UNREADABLE';
    return blocked(code, 'authenticated shared master ref read',
      'Check existing GitHub read access for ChipIn-one/.github master; do not extract gh credentials.');
  }
  if (current?.name !== 'master' || !SHA40.test(current?.commit?.sha ?? '')) {
    return blocked('SHARED_REF_UNREADABLE', 'authenticated shared master ref read',
      'Require authenticated current master branch metadata with an exact commit SHA.');
  }
  if (current.commit.sha !== sharedSourceSha) {
    return blocked('STALE_TRUSTED_SOURCE', 'shared preflight source SHA',
      'Refresh current authenticated ChipIn-one/.github/master and re-pin before admission.');
  }
  const base = {
    status: 'PENDING_VERIFICATION', phase, issue, repository: record.repository,
    integrationBranch: record.integrationBranch, contextDependencies: record.contextDependencies ?? [],
    shared: { repository: SHARED_REPOSITORY, integrationBranch: 'master', sourceSha: sharedSourceSha }
  };
  if (capabilities.approvedCredential === true || capabilities.authenticatedGh === true) {
    const args = ['--issue', issue];
    if (match[1] === 'ChipIn-one/chipin-knowledge-base') args.push('--owner', selectedOwner);
    if (phase !== 'initial-bind') args.push('--expected-revision', expectedRevision);
    return { ...base, transport: capabilities.approvedCredential ? 'approved-credential' : 'authenticated-gh',
      entrypoint: PREFLIGHT, args, verification: 'chipin-issue-admission/v1' };
  }
  if (capabilities.authorizedEvidenceDelivery === true && capabilities.authenticatedArtifactRead === true &&
      capabilities.durableReplayRegistry === true) {
    if (!SHA256.test(expectedRevision ?? '')) {
      return blocked('INVALID_REVISION', 'prebound full canonical revision',
        'Connector-only verified evidence requires a previously approved 64-hex revision.');
    }
    return { ...base, transport: 'trusted-evidence', entrypoint: CONSUMER,
      verification: 'consumeAdmissionArtifact',
      requiredBinding: { issue, revision: expectedRevision, originalReceiptMaxAgeSeconds: 120 } };
  }
  return blocked('AUTH_UNAVAILABLE', 'full native Issue, org Issue Fields and Project #5 reads or trusted evidence delivery',
    'Use an approved existing gh API session or an independently authorized trusted producer/consumer; Executor cannot dispatch or request a new PAT.');
}

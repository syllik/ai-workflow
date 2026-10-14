// Routing only: ChipIn-one/.github owns canonical admission and evidence verification.
const ISSUE = /^(ChipIn-one\/(?:chipin-frontend|chipin-backend|chipin-knowledge-base))#([1-9]\d*)$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SHA40 = /^[a-f0-9]{40}$/u;
const SHARED_REPOSITORY = 'ChipIn-one/.github';
const PREFLIGHT = 'automation/issue-admission-preflight.mjs';
const CONSUMER = 'automation/issue-admission-consumer.mjs';

function blocked(code, capability, remedy) {
  return { status: 'BLOCKED', diagnostic: { code, principal: 'existing-authorized-principal',
    transport: 'unresolved', capability, remedy } };
}

/**
 * Resolve one task-scoped route from an already-loaded canonical workspace record.
 * This returns no authorization. Only the shared reader or verified consumer can
 * supply a fresh INTAKE_COMPLETE result, checked again at every boundary.
 * Capabilities are observed by a trusted caller, never inferred from Issue JSON.
 */
export function resolveChipInAdmissionRoute({ manifest, issue, selectedOwner = null,
  expectedRevision = null, sharedSourceSha, capabilities = {} } = {}) {
  const match = ISSUE.exec(issue ?? '');
  if (!match) return blocked('INVALID_ISSUE', 'exact ChipIn Issue identity', 'Supply one explicit FE/BE/KB Issue; do not discover repositories.');
  if (!SHA40.test(sharedSourceSha ?? '')) return blocked('UNTRUSTED_SOURCE', 'pinned shared master SHA', 'Resolve the current ChipIn-one/.github master explicitly.');
  if (expectedRevision !== null && !SHA256.test(expectedRevision)) {
    return blocked('INVALID_REVISION', 'full canonical revision', 'Supply the exact 64-character canonical revision or start a new canonical read.');
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
  const base = {
    status: 'PENDING_VERIFICATION', issue, repository: record.repository,
    integrationBranch: record.integrationBranch, contextDependencies: record.contextDependencies ?? [],
    shared: { repository: SHARED_REPOSITORY, integrationBranch: 'master', sourceSha: sharedSourceSha }
  };
  // Transport preference is implemented in the shared preflight itself. Neither
  // route nor the presence of a token/gh session represents Issue admission.
  if (capabilities.approvedCredential === true || capabilities.authenticatedGh === true) {
    const args = ['--issue', issue];
    if (selectedOwner) args.push('--owner', selectedOwner);
    if (expectedRevision) args.push('--expected-revision', expectedRevision);
    return { ...base, transport: capabilities.approvedCredential ? 'approved-credential' : 'authenticated-gh',
      entrypoint: PREFLIGHT, args, verification: 'chipin-issue-admission/v1' };
  }
  if (capabilities.authorizedEvidenceDelivery === true && capabilities.authenticatedArtifactRead === true &&
      capabilities.durableReplayRegistry === true) {
    return { ...base, transport: 'trusted-evidence', entrypoint: CONSUMER,
      verification: 'consumeAdmissionArtifact',
      requiredBinding: { issue, revision: expectedRevision, originalReceiptMaxAgeSeconds: 120 } };
  }
  return blocked('AUTH_UNAVAILABLE', 'full native Issue, org Issue Fields and Project #5 reads or trusted evidence delivery',
    'Use an approved existing gh API session or an independently authorized trusted producer/consumer; Executor cannot dispatch or request a new PAT.');
}

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Independent of Task Contract v2. Legacy handoffs always retain Context Policy v1.
export const CONTEXT_POLICY_V1 = 1;
export const CONTEXT_POLICY_V2 = 2;
export const LEGACY_CONTEXT_MAX_BYTES = 32768;
export const DEFAULT_CONTEXT_POLICY = Object.freeze({
  supportedVersions: Object.freeze([1, 2]),
  defaultNewTaskVersion: 1,
  rolloutAllowlist: Object.freeze([]),
  excludedRepositories: Object.freeze(['syllik/Zero-Touch-DCA'])
});
const SHA40 = /^[0-9a-f]{40}$/u;
const SHA64 = /^[0-9a-f]{64}$/u;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const SOURCE_STATES = new Set(['VERIFIED', 'RETRIEVED', 'CONSUMED', 'COVERED']);
const SOURCE_KINDS = new Set(['policy', 'role', 'target', 'dependency', 'reference']);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finding = (code, path) => ({ code, path });
const normalizeRepo = value => typeof value === 'string' ? value.toLowerCase() : null;
const uniqueStrings = xs => Array.isArray(xs) && xs.every(x => typeof x === 'string' && x.trim() !== '') && new Set(xs.map(x => x.toLowerCase())).size === xs.length;
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
const sourceId = source => `${normalizeRepo(source.repository)}@${source.revisionSha}:${source.path}`;

export function validateContextPolicyConfig(policy = DEFAULT_CONTEXT_POLICY) {
  const errors = [];
  if (!isRecord(policy)) return [finding('INVALID_CONTEXT_POLICY', 'contextPolicy')];
  for (const name of Object.keys(policy)) if (!['supportedVersions', 'defaultNewTaskVersion', 'rolloutAllowlist', 'excludedRepositories'].includes(name)) errors.push(finding('UNKNOWN_CONTEXT_POLICY_KEY', `contextPolicy.${name}`));
  if (!Array.isArray(policy.supportedVersions) || policy.supportedVersions.length !== 2 || policy.supportedVersions[0] !== 1 || policy.supportedVersions[1] !== 2) errors.push(finding('INVALID_CONTEXT_VERSIONS', 'contextPolicy.supportedVersions'));
  if (![1, 2].includes(policy.defaultNewTaskVersion)) errors.push(finding('INVALID_DEFAULT_CONTEXT_VERSION', 'contextPolicy.defaultNewTaskVersion'));
  if (!uniqueStrings(policy.rolloutAllowlist) || !policy.rolloutAllowlist.every(s => REPO.test(s))) errors.push(finding('INVALID_ROLLOUT_ALLOWLIST', 'contextPolicy.rolloutAllowlist'));
  if (!uniqueStrings(policy.excludedRepositories) || !policy.excludedRepositories.every(s => REPO.test(s))) errors.push(finding('INVALID_EXCLUDED_REPOSITORIES', 'contextPolicy.excludedRepositories'));
  if (Array.isArray(policy.rolloutAllowlist) && Array.isArray(policy.excludedRepositories) && policy.rolloutAllowlist.some(s => policy.excludedRepositories.some(e => normalizeRepo(s) === normalizeRepo(e)))) errors.push(finding('EXCLUDED_REPOSITORY_IN_ALLOWLIST', 'contextPolicy.rolloutAllowlist'));
  return errors;
}

// Version whose length-budget semantics apply to a repository's documents and new tasks.
export function contextPolicyVersionForRepository(config, repository) {
  if (!isRecord(config) || typeof repository !== 'string' || !REPO.test(repository)) return CONTEXT_POLICY_V1;
  const listed = list => Array.isArray(list) && list.some(r => normalizeRepo(r) === normalizeRepo(repository));
  return listed(config.rolloutAllowlist) && !listed(config.excludedRepositories) ? CONTEXT_POLICY_V2 : CONTEXT_POLICY_V1;
}

// Canonical identity of an activation config, so a caller-supplied policy can be
// compared with the one pinned in workspace.yaml at policySha.
export function canonicalContextPolicy(policy) {
  if (!isRecord(policy)) return null;
  const sortedRepos = list => Array.isArray(list) ? list.map(r => String(r).toLowerCase()).sort() : list;
  return JSON.stringify({
    supportedVersions: policy.supportedVersions,
    defaultNewTaskVersion: policy.defaultNewTaskVersion,
    rolloutAllowlist: sortedRepos(policy.rolloutAllowlist),
    excludedRepositories: sortedRepos(policy.excludedRepositories)
  });
}

// Binds context evidence to one approval and its exact scope.
export function approvalScopeDigest(approval) {
  if (!isRecord(approval)) return null;
  const allowedPaths = Array.isArray(approval.allowedPaths) ? [...approval.allowedPaths].map(String).sort() : null;
  return digest(JSON.stringify({
    reference: approval.reference ?? null,
    allowedPaths,
    publication: approval.publication ?? null,
    maxCorrectionBatches: approval.maxCorrectionBatches ?? null
  }));
}

export function resolveContextPolicy(handoff, config = DEFAULT_CONTEXT_POLICY, { newTask = false } = {}) {
  const findings = validateContextPolicyConfig(config);
  if (!isRecord(handoff)) return { version: null, admitted: false, findings: [...findings, finding('INVALID_HANDOFF', 'handoff')] };
  if (!isRecord(config)) return { version: null, admitted: false, findings };
  // Only an absent field is legacy-compatible; explicit null is malformed.
  // A new task defaults to v2 only where v2 is actually activated for it;
  // everywhere else (v1 contract, not allowlisted, excluded) it falls back to v1.
  const version = Object.hasOwn(handoff, 'contextPolicyVersion')
    ? handoff.contextPolicyVersion
    : (newTask && config.defaultNewTaskVersion === CONTEXT_POLICY_V2 && handoff.contractVersion === 2
      && contextPolicyVersionForRepository(config, handoff.repository) === CONTEXT_POLICY_V2
      ? CONTEXT_POLICY_V2
      : CONTEXT_POLICY_V1);
  if (![1, 2].includes(version) || (!Array.isArray(config.supportedVersions) || !config.supportedVersions.includes(version))) findings.push(finding('UNSUPPORTED_CONTEXT_POLICY_VERSION', 'handoff.contextPolicyVersion'));
  if (handoff.contractVersion !== 2 && version === 2) findings.push(finding('TASK_CONTEXT_VERSION_MISMATCH', 'handoff.contractVersion'));
  if (version === 2 && (!REPO.test(handoff.repository ?? '') || !Array.isArray(config.rolloutAllowlist) || !config.rolloutAllowlist.some(r => normalizeRepo(r) === normalizeRepo(handoff.repository)))) findings.push(finding('CONTEXT_V2_NOT_ACTIVATED', 'handoff.repository'));
  if (Array.isArray(config.excludedRepositories) && config.excludedRepositories.some(r => normalizeRepo(r) === normalizeRepo(handoff.repository)) && version === 2) findings.push(finding('EXCLUDED_REPOSITORY', 'handoff.repository'));
  return { version, admitted: findings.length === 0, findings };
}

export function evaluateContextBytes(version, assembledContext) {
  if (typeof assembledContext !== 'string' || assembledContext.length === 0) return { valid: false, findings: [finding('INVALID_ASSEMBLED_CONTEXT', 'assembledContext')] };
  const actualBytes = Buffer.byteLength(assembledContext, 'utf8');
  const findings = [];
  if (version === 1 && actualBytes > LEGACY_CONTEXT_MAX_BYTES) findings.push(finding('ASSEMBLED_CONTEXT_BUDGET_EXCEEDED', 'assembledContext'));
  if (version !== 1 && version !== 2) findings.push(finding('UNSUPPORTED_CONTEXT_POLICY_VERSION', 'contextPolicyVersion'));
  return { valid: findings.length === 0, actualBytes, maxBytes: version === 1 ? LEGACY_CONTEXT_MAX_BYTES : null, findings };
}

// The caller's Git-object loader must independently attest repository identity, commit, blob SHA and content.
// A source receipt alone cannot set CONSUMED or COVERED.
export function validateContextCoverage(envelope = {}, verifySource) {
  if (!isRecord(envelope)) return [finding('INVALID_CONTEXT_COVERAGE_INPUT', 'coverage')];
  const { sources, expectedSources, mandatorySourceIds, requirementIds, acceptanceIds = [], declaredDependencies = [] } = envelope;
  const findings = [];
  if (![sources, expectedSources, mandatorySourceIds, requirementIds, acceptanceIds, declaredDependencies].every(Array.isArray)) return [finding('INVALID_CONTEXT_COVERAGE_INPUT', 'coverage')];
  const sourcesById = new Map();
  // A Git blob attests content identity, NOT that it was read or that a requirement
  // was covered. Only independent evidence from the trusted runner can do that.
  const trustedEvidenceById = new Map();
  const expected = new Map();
  const duplicateExpectedIds = new Set();
  // Dependency declarations and the manifest are trusted authorization inputs.
  // A malformed declaration cannot authorize any Git-object lookup.
  const validDeclaredDependencies = uniqueStrings(declaredDependencies) && declaredDependencies.every(repo => REPO.test(repo));
  for (const [index, entry] of expectedSources.entries()) {
    if (!isRecord(entry) || !SOURCE_KINDS.has(entry.kind) || !REPO.test(entry.repository ?? '') || !SHA40.test(entry.revisionSha ?? '') || typeof entry.path !== 'string' || !entry.path || entry.path.includes('..') || (Object.hasOwn(entry, 'blobSha') && !SHA40.test(entry.blobSha ?? '')) || (Object.hasOwn(entry, 'sha256') && !SHA64.test(entry.sha256 ?? ''))) {
      findings.push(finding('INVALID_EXPECTED_SOURCE', `expectedSources.${index}`));
      continue;
    }
    const key = sourceId(entry);
    if (expected.has(key)) {
      findings.push(finding('DUPLICATE_EXPECTED_SOURCE', `expectedSources.${index}`));
      duplicateExpectedIds.add(key);
    } else expected.set(key, entry);
    // Dependency authority comes from the trusted expected manifest, never source self-labeling.
    if (entry.kind === 'dependency' && !declaredDependencies.some(repo => normalizeRepo(repo) === normalizeRepo(entry.repository))) {
      findings.push(finding('UNDECLARED_CONTEXT_DEPENDENCY', `expectedSources.${index}`));
    }
  }
  for (const [index, source] of sources.entries()) {
    const key = isRecord(source) ? sourceId(source) : '';
    if (!isRecord(source) || !REPO.test(source.repository ?? '') || !SHA40.test(source.revisionSha ?? '') || !SHA40.test(source.blobSha ?? '') || !SHA64.test(source.sha256 ?? '') || typeof source.path !== 'string' || !source.path || source.path.includes('..') || !SOURCE_STATES.has(source.state) || !SOURCE_KINDS.has(source.kind)) { findings.push(finding('INVALID_CONTEXT_SOURCE', `sources.${index}`)); continue; }
    const duplicateSource = sourcesById.has(key);
    if (duplicateSource) findings.push(finding('DUPLICATE_CONTEXT_SOURCE', `sources.${index}`));
    sourcesById.set(key, source);
    const expectedEntry = expected.get(key);
    if (!expectedEntry) findings.push(finding('UNEXPECTED_CONTEXT_SOURCE', `sources.${index}`));
    else if (source.kind !== expectedEntry.kind) findings.push(finding('CONTEXT_SOURCE_KIND_MISMATCH', `sources.${index}.kind`));
    const manifestHashMatches = expectedEntry &&
      (!Object.hasOwn(expectedEntry, 'blobSha') || expectedEntry.blobSha === source.blobSha) &&
      (!Object.hasOwn(expectedEntry, 'sha256') || expectedEntry.sha256 === source.sha256);
    if (expectedEntry && !manifestHashMatches) findings.push(finding('CONTEXT_SOURCE_MANIFEST_MISMATCH', `sources.${index}`));
    const dependencyAllowed = expectedEntry?.kind !== 'dependency' || declaredDependencies.some(repo => normalizeRepo(repo) === normalizeRepo(source.repository));
    // Authorization is a precondition to ANY call to the trusted Git-object loader.
    // A receipt cannot expand the manifest, impersonate a kind, or introduce a dependency.
    const sourceAuthorized = !!expectedEntry && expectedEntry.kind === source.kind && manifestHashMatches
      && !duplicateSource && !duplicateExpectedIds.has(key) && validDeclaredDependencies && dependencyAllowed;
    let trusted;
    if (sourceAuthorized && typeof verifySource === 'function') {
      try { trusted = verifySource(source); } catch { trusted = null; }
    }
    let gitVerified = false;
    if (!isRecord(trusted) || normalizeRepo(trusted.repository) !== normalizeRepo(source.repository) || trusted.path !== source.path || trusted.revisionSha !== source.revisionSha || trusted.blobSha !== source.blobSha || typeof trusted.content !== 'string') {
      findings.push(finding('UNVERIFIED_GIT_SOURCE', `sources.${index}`));
    } else if (digest(trusted.content) !== source.sha256 || (typeof source.content === 'string' && source.content !== trusted.content)) {
      findings.push(finding('CONTEXT_HASH_MISMATCH', `sources.${index}.sha256`));
    } else {
      gitVerified = true;
    }
    const claimsConsumption = source.state === 'CONSUMED' || source.state === 'COVERED';
    const receiptConsumption = source.consumption?.fullSource === true && source.consumption?.sourceSha256 === source.sha256;
    // The independent verifier must attest a full read bound to this exact content
    // hash; receipt-supplied consumption flags never establish it on their own.
    const trustedConsumption = gitVerified && trusted.consumption?.fullSource === true && trusted.consumption?.sourceSha256 === source.sha256;
    if (claimsConsumption && !receiptConsumption) findings.push(finding('INCOMPLETE_SOURCE_CONSUMPTION', `sources.${index}.consumption`));
    if (claimsConsumption && !trustedConsumption) findings.push(finding('UNVERIFIED_SOURCE_CONSUMPTION', `sources.${index}.consumption`));
    // A string's substring .includes() is not an exact requirement/acceptance match.
    // COVERED receipts must supply unique arrays; optional claims in other states must also be well-typed.
    for (const field of ['coveredRequirements', 'coveredAcceptance']) {
      if ((source.state === 'COVERED' || Object.hasOwn(source, field)) && !uniqueStrings(source[field])) {
        findings.push(finding('INVALID_CONTEXT_COVERAGE_CLAIMS', `sources.${index}.${field}`));
      }
    }
    const attestedClaims = source.state === 'COVERED'
      && uniqueStrings(trusted?.coveredRequirements) && uniqueStrings(trusted?.coveredAcceptance)
      && uniqueStrings(source.coveredRequirements) && uniqueStrings(source.coveredAcceptance)
      && source.coveredRequirements.every(id => trusted.coveredRequirements.includes(id))
      && source.coveredAcceptance.every(id => trusted.coveredAcceptance.includes(id));
    if (source.state === 'COVERED' && !attestedClaims) findings.push(finding('UNVERIFIED_SOURCE_COVERAGE', `sources.${index}`));
    const consumed = claimsConsumption && receiptConsumption && trustedConsumption && sourceAuthorized;
    trustedEvidenceById.set(key, { consumed, covered: consumed && attestedClaims });
  }
  for (const key of expected.keys()) if (!sourcesById.has(key)) findings.push(finding('MISSING_EXPECTED_SOURCE', `sources.${key}`));
  for (const key of mandatorySourceIds) {
    const source = sourcesById.get(key);
    if (!source) findings.push(finding('MISSING_MANDATORY_SOURCE', `sources.${key}`));
    else if (!trustedEvidenceById.get(key)?.consumed) findings.push(finding('MANDATORY_SOURCE_NOT_CONSUMED', `sources.${key}`));
  }
  if (!uniqueStrings(requirementIds) || !uniqueStrings(acceptanceIds) || !validDeclaredDependencies) findings.push(finding('INVALID_COVERAGE_IDENTITIES', 'coverage'));
  for (const id of requirementIds) if (!sources.some(s => isRecord(s) && s.state === 'COVERED' && trustedEvidenceById.get(sourceId(s))?.covered && s.coveredRequirements.includes(id))) findings.push(finding('UNCOVERED_REQUIREMENT', `requirements.${id}`));
  for (const id of acceptanceIds) if (!sources.some(s => isRecord(s) && s.state === 'COVERED' && trustedEvidenceById.get(sourceId(s))?.covered && s.coveredAcceptance.includes(id))) findings.push(finding('UNCOVERED_ACCEPTANCE', `acceptance.${id}`));
  return findings;
}

// Length classification is policy-aware; structural and generated-file integrity are separate HARD checks.
export function classifyDocumentBudget(filePath, version, budgets) {
  if (typeof filePath !== 'string' || !isRecord(budgets)) return { severity: 'HARD', maximumBytes: null, findings: [finding('INVALID_DOCUMENT_BUDGET_INPUT', 'budget')] };
  const path = filePath.replaceAll('\\', '/');
  const key = path === 'AI.md' || path.endsWith('/AI.md') ? 'AI.md'
    : path === 'FLOW.md' || path.endsWith('/FLOW.md') ? 'FLOW.md'
    : path.startsWith('global/') ? 'global role file'
    : path === 'AGENTS.md' || path.endsWith('/AGENTS.md') ? 'managed AGENTS block'
    : path === '.ai/context.md' || path.endsWith('/.ai/context.md') ? '.ai/context.md'
    : path.endsWith('/decisions.md') ? 'one decision record'
    : path.endsWith('/prompt.md') ? 'prompt.md'
    : path.endsWith('/state.md') ? 'state.md'
    : path.endsWith('/result.md') ? 'result.md'
    : path.endsWith('/plan.md') ? 'human plan.md'
    : null;
  if (![1, 2].includes(version)) return { severity: 'HARD', maximumBytes: null, findings: [finding('UNSUPPORTED_CONTEXT_POLICY_VERSION', 'contextPolicyVersion')] };
  return { severity: version === 1 || key === 'AI.md' || key === 'FLOW.md' ? 'HARD' : 'ADVISORY', maximumBytes: key ? budgets[key] ?? null : null, findings: [] };
}

export function checkDocumentBudget(filePath, content, version, budgets) {
  const classification = classifyDocumentBudget(filePath, version, budgets);
  if (classification.findings.length || typeof content !== 'string') return { blocked: true, findings: [...classification.findings, ...(typeof content === 'string' ? [] : [finding('INVALID_DOCUMENT_CONTENT', filePath)])] };
  const actualBytes = Buffer.byteLength(content, 'utf8');
  const exceeded = classification.maximumBytes !== null && actualBytes > classification.maximumBytes;
  const findings = exceeded ? [{ code: 'BUDGET_EXCEEDED', path: filePath, severity: classification.severity, actualBytes, maximumBytes: classification.maximumBytes }] : [];
  return { blocked: exceeded && classification.severity === 'HARD', actualBytes, ...classification, findings };
}

export function chooseCompaction(capabilities, { required = false } = {}) {
  if (isRecord(capabilities) && capabilities.nativeCompaction === 'SUPPORTED' && capabilities.trustedAdapter === true) return { action: 'NATIVE_COMPACTION_WITH_CHECKPOINT', blocked: false };
  return required ? { action: 'BLOCKED_UNSUPPORTED_COMPACTION', blocked: true } : { action: 'VERIFIED_CHECKPOINT_RESTART', blocked: false };
}

// No universal runtime token threshold: the adapter reports current usage/capacity/reserve.
// Unknown or unreliable values never become PASSED.
export function assessRuntime(runtime = null) {
  if (!isRecord(runtime) || runtime.status === 'UNMEASURED') return { status: 'UNMEASURED', decision: 'PROGRESSIVE_CHECKPOINT', findings: [] };
  if (runtime.status !== 'MEASURED' || ![runtime.usedTokens, runtime.capacityTokens, runtime.reserveTokens].every(Number.isSafeInteger) || runtime.usedTokens < 0 || runtime.capacityTokens <= 0 || runtime.reserveTokens < 0 || runtime.reliable !== true || runtime.trustedAdapter !== true) return { status: 'UNRELIABLE', decision: 'PROGRESSIVE_CHECKPOINT', findings: [finding('UNRELIABLE_RUNTIME_METRICS', 'runtime')] };
  if (runtime.usedTokens + runtime.reserveTokens >= runtime.capacityTokens) return { status: 'MEASURED', decision: 'BLOCKED_CAPACITY', findings: [finding('RUNTIME_CAPACITY_INSUFFICIENT', 'runtime')] };
  return { status: 'MEASURED', decision: 'CONTINUE', remainingTokens: runtime.capacityTokens - runtime.usedTokens - runtime.reserveTokens, findings: [] };
}

// Checkpoint values must be useful and safe, not merely present. The trusted caller
// independently revalidates authority and pinned Git sources on resume.
function validateCheckpointPayload(payload) {
  const findings = [];
  const required = ['contractVersion', 'contextPolicyVersion', 'policySha', 'baseSha', 'headSha', 'repository', 'approval', 'allowedPaths', 'sources', 'requirementCoverage', 'completedWork', 'pendingWork', 'validationEvidence'];
  for (const key of required) if (!Object.hasOwn(payload, key)) findings.push(finding('INCOMPLETE_CHECKPOINT', `checkpoint.payload.${key}`));
  const invalid = key => findings.push(finding('INVALID_CHECKPOINT_PAYLOAD', `checkpoint.payload.${key}`));
  if (![1, 2].includes(payload.contractVersion)) invalid('contractVersion');
  if (![1, 2].includes(payload.contextPolicyVersion) || (payload.contextPolicyVersion === 2 && payload.contractVersion !== 2)) invalid('contextPolicyVersion');
  for (const key of ['policySha', 'baseSha', 'headSha']) if (typeof payload[key] !== 'string' || !SHA40.test(payload[key])) invalid(key);
  if (typeof payload.repository !== 'string' || !REPO.test(payload.repository)) invalid('repository');
  if (!isRecord(payload.approval) || typeof payload.approval.reference !== 'string' || !payload.approval.reference.trim()) invalid('approval');
  const validAllowedPath = p => typeof p === 'string' && (p === '**' || /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+(?:\/\*\*)?$/u.test(p)) && !p.split('/').some(x => x === '.' || x === '..');
  if (!Array.isArray(payload.allowedPaths) || payload.allowedPaths.length === 0 || !payload.allowedPaths.every(validAllowedPath) || new Set(payload.allowedPaths).size !== payload.allowedPaths.length) invalid('allowedPaths');
  const validSource = source => isRecord(source) && SOURCE_KINDS.has(source.kind) && typeof source.repository === 'string' && REPO.test(source.repository) && typeof source.path === 'string' && source.path.length > 0 && !source.path.split('/').some(x => x === '' || x === '.' || x === '..') && typeof source.revisionSha === 'string' && SHA40.test(source.revisionSha) && typeof source.blobSha === 'string' && SHA40.test(source.blobSha) && typeof source.sha256 === 'string' && SHA64.test(source.sha256);
  if (!Array.isArray(payload.sources) || payload.sources.length === 0 || !payload.sources.every(validSource) || new Set((Array.isArray(payload.sources) ? payload.sources.filter(validSource) : []).map(sourceId)).size !== (Array.isArray(payload.sources) ? payload.sources.length : 0)) invalid('sources');
  for (const key of ['requirementCoverage', 'completedWork', 'pendingWork']) if (!uniqueStrings(payload[key])) invalid(key);
  if (!Array.isArray(payload.validationEvidence) || !payload.validationEvidence.every(x => typeof x === 'string' ? !!x.trim() : isRecord(x) && Object.keys(x).length > 0)) invalid('validationEvidence');
  return findings;
}

// Checkpoint scope/coverage and Git source manifests are sets, not execution-ordered logs.
// Canonicalize object keys recursively, and sort only top-level set-valued fields;
// work logs and nested arrays keep their order. Duplicate entries are not collapsed.
function canonicalCheckpointValue(value) {
  if (Array.isArray(value)) return value.map(canonicalCheckpointValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalCheckpointValue(value[key])]));
}

function equivalentCheckpointAuthority(field, checkpointValue, currentValue) {
  if (field !== 'approval' && (!Array.isArray(checkpointValue) || !Array.isArray(currentValue))) return false;
  if (field === 'approval' && (!isRecord(checkpointValue) || !isRecord(currentValue))) return false;
  const normalize = value => {
    // GitHub repository identities are case-insensitive. Normalize only the
    // source identity field; paths, SHAs, and other evidence remain exact.
    const normalized = field === 'sources' && isRecord(value) && typeof value.repository === 'string'
      ? { ...value, repository: normalizeRepo(value.repository) }
      : value;
    return JSON.stringify(canonicalCheckpointValue(normalized));
  };
  if (field === 'approval') return normalize(checkpointValue) === normalize(currentValue);
  // Each array is a multiset: stable object-key order and collection order are
  // irrelevant, but a missing, duplicate, or changed entry remains a change.
  const a = checkpointValue.map(normalize).sort();
  const b = currentValue.map(normalize).sort();
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

// Security boundary: checkpoint must be authenticated by trusted storage/secret held outside agent context.
export function signContextCheckpoint(payload, trustedSecret) {
  if (!isRecord(payload) || typeof trustedSecret !== 'string' || trustedSecret.length < 32) throw new Error('Trusted checkpoint secret required');
  const material = JSON.stringify(payload);
  return { checkpointVersion: 1, payload, mac: createHmac('sha256', trustedSecret).update(material).digest('hex') };
}

export function verifyContextCheckpoint(checkpoint, trustedSecret, current) {
  const findings = [];
  if (!isRecord(checkpoint) || checkpoint.checkpointVersion !== 1 || !isRecord(checkpoint.payload) || !SHA64.test(checkpoint.mac ?? '') || typeof trustedSecret !== 'string' || trustedSecret.length < 32) return { valid: false, findings: [finding('INVALID_CHECKPOINT', 'checkpoint')] };
  const { payload } = checkpoint;
  const mac = createHmac('sha256', trustedSecret).update(JSON.stringify(payload)).digest();
  if (!timingSafeEqual(mac, Buffer.from(checkpoint.mac, 'hex'))) findings.push(finding('FORGED_CHECKPOINT', 'checkpoint.mac'));
  findings.push(...validateCheckpointPayload(payload));
  for (const field of ['contractVersion', 'policySha', 'baseSha', 'headSha', 'repository', 'contextPolicyVersion']) {
    const matches = field === 'repository'
      ? typeof current?.repository === 'string' && REPO.test(current.repository) && normalizeRepo(payload.repository) === normalizeRepo(current.repository)
      : payload[field] === current?.[field];
    if (!matches) findings.push(finding('CHECKPOINT_REPOSITORY_DRIFT', `current.${field}`));
  }
  // Approval, allowed scope, sources and coverage cannot silently change at resume.
  for (const field of ['approval', 'allowedPaths', 'sources', 'requirementCoverage']) if (!equivalentCheckpointAuthority(field, payload[field], current?.[field])) findings.push(finding('CHECKPOINT_AUTHORITY_DRIFT', `current.${field}`));
  // The caller must revalidate the authority, exact scope, source manifests and all mandatory normative files.
  if (current?.freshAuthorityValidated !== true || current?.allMandatorySourcesRehydrated !== true || current?.coverageRevalidated !== true) findings.push(finding('CHECKPOINT_REVALIDATION_REQUIRED', 'current'));
  return { valid: findings.length === 0, findings };
}

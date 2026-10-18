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
  if (!uniqueStrings(policy.excludedRepositories) || !policy.excludedRepositories.every(s => REPO.test(s)) || !policy.excludedRepositories.some(s => normalizeRepo(s) === 'syllik/zero-touch-dca')) errors.push(finding('MISSING_REQUIRED_EXCLUSION', 'contextPolicy.excludedRepositories'));
  if (Array.isArray(policy.rolloutAllowlist) && Array.isArray(policy.excludedRepositories) && policy.rolloutAllowlist.some(s => policy.excludedRepositories.some(e => normalizeRepo(s) === normalizeRepo(e)))) errors.push(finding('EXCLUDED_REPOSITORY_IN_ALLOWLIST', 'contextPolicy.rolloutAllowlist'));
  return errors;
}

export function resolveContextPolicy(handoff, config = DEFAULT_CONTEXT_POLICY, { newTask = false } = {}) {
  const findings = validateContextPolicyConfig(config);
  if (!isRecord(handoff)) return { version: null, admitted: false, findings: [...findings, finding('INVALID_HANDOFF', 'handoff')] };
  if (!isRecord(config)) return { version: null, admitted: false, findings };
  // Only an absent field is legacy-compatible; explicit null is malformed.
  const version = Object.hasOwn(handoff, 'contextPolicyVersion')
    ? handoff.contextPolicyVersion
    : (newTask ? config.defaultNewTaskVersion : CONTEXT_POLICY_V1);
  if (![1, 2].includes(version) || !config.supportedVersions?.includes(version)) findings.push(finding('UNSUPPORTED_CONTEXT_POLICY_VERSION', 'handoff.contextPolicyVersion'));
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
export function validateContextCoverage({ sources, expectedSources, mandatorySourceIds, requirementIds, acceptanceIds = [], declaredDependencies = [] } = {}, verifySource) {
  const findings = [];
  if (![sources, expectedSources, mandatorySourceIds, requirementIds, acceptanceIds, declaredDependencies].every(Array.isArray)) return [finding('INVALID_CONTEXT_COVERAGE_INPUT', 'coverage')];
  const sourcesById = new Map();
  const expected = new Map();
  for (const [index, entry] of expectedSources.entries()) {
    if (!isRecord(entry) || !SOURCE_KINDS.has(entry.kind) || !REPO.test(entry.repository ?? '') || !SHA40.test(entry.revisionSha ?? '') || typeof entry.path !== 'string' || !entry.path || entry.path.includes('..')) {
      findings.push(finding('INVALID_EXPECTED_SOURCE', `expectedSources.${index}`));
      continue;
    }
    const key = sourceId(entry);
    if (expected.has(key)) findings.push(finding('DUPLICATE_EXPECTED_SOURCE', `expectedSources.${index}`));
    expected.set(key, entry);
    // Dependency authority comes from the trusted expected manifest, never source self-labeling.
    if (entry.kind === 'dependency' && !declaredDependencies.some(repo => normalizeRepo(repo) === normalizeRepo(entry.repository))) {
      findings.push(finding('UNDECLARED_CONTEXT_DEPENDENCY', `expectedSources.${index}`));
    }
  }
  for (const [index, source] of sources.entries()) {
    const key = isRecord(source) ? sourceId(source) : '';
    if (!isRecord(source) || !REPO.test(source.repository ?? '') || !SHA40.test(source.revisionSha ?? '') || !SHA40.test(source.blobSha ?? '') || !SHA64.test(source.sha256 ?? '') || typeof source.path !== 'string' || !source.path || source.path.includes('..') || !SOURCE_STATES.has(source.state) || !SOURCE_KINDS.has(source.kind)) { findings.push(finding('INVALID_CONTEXT_SOURCE', `sources.${index}`)); continue; }
    if (sourcesById.has(key)) findings.push(finding('DUPLICATE_CONTEXT_SOURCE', `sources.${index}`));
    sourcesById.set(key, source);
    const expectedEntry = expected.get(key);
    if (!expectedEntry) findings.push(finding('UNEXPECTED_CONTEXT_SOURCE', `sources.${index}`));
    else if (source.kind !== expectedEntry.kind) findings.push(finding('CONTEXT_SOURCE_KIND_MISMATCH', `sources.${index}.kind`));
    // Expected source provenance MUST be independently attested from a trusted Git-object reader.
    // Never accept self-reported verifiedByGit flags as proof.
    let trusted;
    if (typeof verifySource === 'function') {
      try { trusted = verifySource(source); } catch { trusted = null; }
    }
    if (!isRecord(trusted) || normalizeRepo(trusted.repository) !== normalizeRepo(source.repository) || trusted.path !== source.path || trusted.revisionSha !== source.revisionSha || trusted.blobSha !== source.blobSha || typeof trusted.content !== 'string') {
      findings.push(finding('UNVERIFIED_GIT_SOURCE', `sources.${index}`));
    } else if (digest(trusted.content) !== source.sha256 || (typeof source.content === 'string' && source.content !== trusted.content)) {
      findings.push(finding('CONTEXT_HASH_MISMATCH', `sources.${index}.sha256`));
    }
    if (source.state === 'CONSUMED' || source.state === 'COVERED') {
      // Consuming only a receipt cannot substitute for the full normative source.
      if (source.consumption?.fullSource !== true || source.consumption?.sourceSha256 !== source.sha256) findings.push(finding('INCOMPLETE_SOURCE_CONSUMPTION', `sources.${index}.consumption`));
    }
  }
  for (const key of expected.keys()) if (!sourcesById.has(key)) findings.push(finding('MISSING_EXPECTED_SOURCE', `sources.${key}`));
  for (const key of mandatorySourceIds) {
    const source = sourcesById.get(key);
    if (!source) findings.push(finding('MISSING_MANDATORY_SOURCE', `sources.${key}`));
    else if (!['CONSUMED', 'COVERED'].includes(source.state) || source.consumption?.fullSource !== true) findings.push(finding('MANDATORY_SOURCE_NOT_CONSUMED', `sources.${key}`));
  }
  if (!uniqueStrings(requirementIds) || !uniqueStrings(acceptanceIds) || !uniqueStrings(declaredDependencies)) findings.push(finding('INVALID_COVERAGE_IDENTITIES', 'coverage'));
  for (const id of requirementIds) if (!sources.some(s => isRecord(s) && s.state === 'COVERED' && s.consumption?.fullSource === true && s.consumption?.sourceSha256 === s.sha256 && s.coveredRequirements?.includes(id))) findings.push(finding('UNCOVERED_REQUIREMENT', `requirements.${id}`));
  for (const id of acceptanceIds) if (!sources.some(s => isRecord(s) && s.state === 'COVERED' && s.consumption?.fullSource === true && s.consumption?.sourceSha256 === s.sha256 && s.coveredAcceptance?.includes(id))) findings.push(finding('UNCOVERED_ACCEPTANCE', `acceptance.${id}`));
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
  for (const key of ['contractVersion', 'contextPolicyVersion', 'policySha', 'baseSha', 'headSha', 'repository', 'approval', 'allowedPaths', 'sources', 'requirementCoverage', 'completedWork', 'pendingWork', 'validationEvidence']) if (!(key in payload)) findings.push(finding('INCOMPLETE_CHECKPOINT', `checkpoint.payload.${key}`));
  for (const field of ['contractVersion', 'policySha', 'baseSha', 'headSha', 'repository', 'contextPolicyVersion']) if (payload[field] !== current?.[field]) findings.push(finding('CHECKPOINT_REPOSITORY_DRIFT', `current.${field}`));
  // The caller must revalidate the authority, exact scope, source manifests and all mandatory normative files.
  if (current?.freshAuthorityValidated !== true || current?.allMandatorySourcesRehydrated !== true || current?.coverageRevalidated !== true) findings.push(finding('CHECKPOINT_REVALIDATION_REQUIRED', 'current'));
  return { valid: findings.length === 0, findings };
}

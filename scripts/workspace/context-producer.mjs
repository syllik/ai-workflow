import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { checkAssembledExecutionContext, utf8Bytes } from './budgets.mjs';
import { approvalScopeDigest, canonicalContextPolicy, DEFAULT_CONTEXT_POLICY, evaluateContextBytes, LEGACY_CONTEXT_MAX_BYTES, resolveContextPolicy } from './context-policy.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const POLICY_BOUND_KINDS = new Set(['policy', 'role']);
const SUPPORTED_SOURCE_KINDS = new Set(['policy', 'role', 'target', 'dependency', 'reference']);
const CANONICAL_POLICY_REPOSITORY = 'syllik/ai-workflow';
const CANONICAL_POLICY_PATHS = Object.freeze(['AI.md', 'FLOW.md', 'workspace.yaml', 'projects/index.md', 'global/workflow.md']);
const CANONICAL_HANDOFF_ROLE = 'executor';
const CANONICAL_HANDOFF_ROLE_PATH = 'global/executor.md';

function finding(code, path, details = {}) {
  return { code, path, ...details };
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function validSha(value) {
  return typeof value === 'string' && SHA_PATTERN.test(value);
}

function uniqueStrings(value) {
  return Array.isArray(value)
    && value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
    && new Set(value).size === value.length;
}

function normalizeRepository(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function sourceKey(source) {
  return JSON.stringify([
    source.kind,
    normalizeRepository(source.repository),
    source.path,
    source.revisionSha
  ]);
}

function coverageSourceId(source) {
  return `${normalizeRepository(source.repository)}@${source.revisionSha}:${source.path}`;
}

function normalizeRemote(value) {
  if (typeof value !== 'string') return '';
  return value.trim()
    .replace(/^git@github\.com:/u, 'https://github.com/')
    .replace(/^ssh:\/\/git@github\.com\//u, 'https://github.com/')
    .replace(/\.git$/u, '')
    .replace(/\/$/u, '')
    .toLowerCase();
}

function repositoryRootFor(repositoryRoots, repository) {
  if (!repositoryRoots || typeof repositoryRoots !== 'object' || Array.isArray(repositoryRoots)) return null;
  const key = normalizeRepository(repository);
  for (const [candidate, root] of Object.entries(repositoryRoots)) {
    if (
      normalizeRepository(candidate) === key
      && typeof root === 'string'
      && root.trim().length > 0
    ) {
      return root.trim();
    }
  }
  return null;
}

function gitText(repositoryRoot, args) {
  return execFileSync('git', ['-C', repositoryRoot, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function gitSourceLoader(source, input) {
  const repositoryRoot = repositoryRootFor(input.repositoryRoots, source.repository);
  if (!repositoryRoot) throw new Error('repository root unavailable');

  const origin = gitText(repositoryRoot, ['config', '--get', 'remote.origin.url']).trim();
  const expectedRemote = `https://github.com/${source.repository}`;
  if (normalizeRemote(origin) !== normalizeRemote(expectedRemote)) {
    throw new Error('repository origin mismatch');
  }

  const objectType = gitText(repositoryRoot, ['cat-file', '-t', source.revisionSha]).trim();
  if (objectType !== 'commit') throw new Error('revision is not a commit');

  const objectRef = `${source.revisionSha}:${source.path}`;
  const sourceType = gitText(repositoryRoot, ['cat-file', '-t', objectRef]).trim();
  if (sourceType !== 'blob') throw new Error('source object is not a blob');

  const blobSha = gitText(repositoryRoot, ['rev-parse', objectRef]).trim();
  if (!validSha(blobSha)) throw new Error('source blob sha unavailable');

  const content = gitText(repositoryRoot, ['show', objectRef]);
  return { content, blobSha };
}

function gitIntegrationBranchResolver(dependency, input) {
  const repositoryRoot = repositoryRootFor(input.repositoryRoots, dependency.repository);
  if (!repositoryRoot) throw new Error('dependency repository root unavailable');

  const origin = gitText(repositoryRoot, ['config', '--get', 'remote.origin.url']).trim();
  const expectedRemote = `https://github.com/${dependency.repository}`;
  if (normalizeRemote(origin) !== normalizeRemote(expectedRemote)) {
    throw new Error('dependency repository origin mismatch');
  }

  for (const ref of [
    `refs/remotes/origin/${dependency.integrationBranch}`,
    `refs/heads/${dependency.integrationBranch}`
  ]) {
    try {
      const sha = gitText(repositoryRoot, ['rev-parse', '--verify', `${ref}^{commit}`]).trim();
      if (validSha(sha)) return sha;
    } catch {
      // Try the next trusted local branch reference.
    }
  }
  throw new Error('dependency integration branch unavailable');
}

function hydrateSource(source, index, input, findings, sourceLoader) {
  let trusted;
  try {
    trusted = sourceLoader(source, input);
  } catch {
    findings.push(finding('CONTEXT_SOURCE_PROVENANCE_UNAVAILABLE', `sources.${index}`));
    return null;
  }

  if (
    !trusted
    || typeof trusted.content !== 'string'
    || trusted.content.trim().length === 0
    || !validSha(trusted.blobSha)
  ) {
    findings.push(finding('CONTEXT_SOURCE_PROVENANCE_UNAVAILABLE', `sources.${index}`));
    return null;
  }

  if (source.content !== null && source.content !== trusted.content) {
    findings.push(finding('CONTEXT_SOURCE_CONTENT_MISMATCH', `sources.${index}.content`, {
      repository: source.repository,
      path: source.path,
      revisionSha: source.revisionSha
    }));
  }

  return {
    ...source,
    content: trusted.content,
    blobSha: trusted.blobSha
  };
}

function validateCanonicalExpectedSources(expectedSources, policySha, headSha, role, findings) {
  if (role !== CANONICAL_HANDOFF_ROLE) {
    findings.push(finding('INVALID_CONTEXT_ROLE', 'role', {
      expected: CANONICAL_HANDOFF_ROLE,
      actual: role ?? null
    }));
  }
  if (!validSha(policySha) || !validSha(headSha)) return;

  const policySources = expectedSources.filter((source) => source.kind === 'policy');
  const unexpectedPolicySources = policySources.filter((source) =>
    normalizeRepository(source.repository) !== CANONICAL_POLICY_REPOSITORY
    || !CANONICAL_POLICY_PATHS.includes(source.path)
    || source.revisionSha !== policySha
  );
  if (policySources.length !== CANONICAL_POLICY_PATHS.length || unexpectedPolicySources.length > 0) {
    findings.push(finding('CONTEXT_CANONICAL_POLICY_INVALID', 'canonical.policy', {
      actualCount: policySources.length,
      expectedCount: CANONICAL_POLICY_PATHS.length,
      unexpectedCount: unexpectedPolicySources.length
    }));
  }

  for (const path of CANONICAL_POLICY_PATHS) {
    if (!expectedSources.some((source) =>
      source.kind === 'policy'
      && normalizeRepository(source.repository) === CANONICAL_POLICY_REPOSITORY
      && source.path === path
      && source.revisionSha === policySha
    )) {
      findings.push(finding('CONTEXT_CANONICAL_SOURCE_UNAVAILABLE', `canonical.policy.${path}`));
    }
  }

  const roleSources = expectedSources.filter((source) => source.kind === 'role');
  const canonicalRoleSources = roleSources.filter((source) =>
    normalizeRepository(source.repository) === CANONICAL_POLICY_REPOSITORY
    && source.revisionSha === policySha
    && source.path === CANONICAL_HANDOFF_ROLE_PATH
  );
  if (roleSources.length !== 1 || canonicalRoleSources.length !== 1) {
    findings.push(finding('CONTEXT_CANONICAL_ROLE_INVALID', 'canonical.role', {
      expectedRole: CANONICAL_HANDOFF_ROLE,
      expectedPath: CANONICAL_HANDOFF_ROLE_PATH,
      actualCount: roleSources.length,
      canonicalCount: canonicalRoleSources.length
    }));
  }

  const targetAgents = expectedSources.filter((source) => source.kind === 'target' && source.path === 'AGENTS.md');
  const targetContexts = expectedSources.filter((source) => source.kind === 'target' && source.path === '.ai/context.md');
  if (targetAgents.length !== 1) {
    findings.push(finding('CONTEXT_CANONICAL_SOURCE_UNAVAILABLE', 'canonical.target.AGENTS.md', { actualCount: targetAgents.length }));
  }
  if (targetContexts.length !== 1) {
    findings.push(finding('CONTEXT_CANONICAL_SOURCE_UNAVAILABLE', 'canonical.target..ai/context.md', { actualCount: targetContexts.length }));
  }
  if (targetAgents.length === 1 && targetContexts.length === 1) {
    const targetRepository = normalizeRepository(targetAgents[0].repository);
    if (
      targetRepository !== normalizeRepository(targetContexts[0].repository)
      || targetAgents[0].revisionSha !== headSha
      || targetContexts[0].revisionSha !== headSha
    ) {
      findings.push(finding('CONTEXT_TARGET_SOURCE_SET_MISMATCH', 'canonical.target', {
        expectedRevisionSha: headSha,
        agentsRevisionSha: targetAgents[0].revisionSha,
        contextRevisionSha: targetContexts[0].revisionSha
      }));
    }

    for (const [index, source] of expectedSources.entries()) {
      if (
        source.kind === 'target'
        && (
          normalizeRepository(source.repository) !== targetRepository
          || source.revisionSha !== headSha
        )
      ) {
        findings.push(finding('CONTEXT_TARGET_SOURCE_SET_MISMATCH', `expectedSources.${index}`, {
          expectedRepository: targetAgents[0].repository,
          expectedRevisionSha: headSha,
          actualRepository: source.repository,
          actualRevisionSha: source.revisionSha
        }));
      }
    }
  }
  // Only the target's exact normative PRODUCT contract may be reference-only.
  // Required policy, role, AGENTS, context and declared dependencies remain inline.
  const references = expectedSources.filter((source) => source.kind === 'reference');
  if (references.length > 1 || references.some((source) =>
    source.path !== 'docs/PRODUCT.md'
    || normalizeRepository(source.repository) !== normalizeRepository(targetAgents[0]?.repository)
    || source.revisionSha !== headSha
  )) {
    findings.push(finding('CONTEXT_CANONICAL_REFERENCE_INVALID', 'canonical.reference', {
      actualCount: references.length
    }));
  }
}

function validateRequiredContextDependencies(sources, dependencies, policySha, input, findings, integrationBranchResolver) {
  const workspaceSource = sources.find((source) =>
    source.kind === 'policy'
    && normalizeRepository(source.repository) === CANONICAL_POLICY_REPOSITORY
    && source.path === 'workspace.yaml'
    && source.revisionSha === policySha
  );
  const targetAgents = sources.find((source) => source.kind === 'target' && source.path === 'AGENTS.md');
  const targetContext = sources.find((source) => source.kind === 'target' && source.path === '.ai/context.md');
  if (!workspaceSource || !targetAgents || !targetContext) return;

  let workspace;
  try {
    workspace = parse(workspaceSource.content);
  } catch {
    findings.push(finding('CONTEXT_WORKSPACE_REGISTRY_UNAVAILABLE', 'sources.workspace.yaml'));
    return;
  }

  const projects = Array.isArray(workspace?.projects) ? workspace.projects : [];
  const targetRepository = normalizeRepository(targetAgents.repository);
  const targetRecords = projects.filter((project) =>
    normalizeRepository(project?.repository) === targetRepository
  );
  if (targetRecords.length !== 1) {
    findings.push(finding('CONTEXT_TARGET_REGISTRY_UNAVAILABLE', 'workspace.projects', {
      repository: targetAgents.repository,
      actualCount: targetRecords.length
    }));
    return;
  }

  const targetRecord = targetRecords[0];
  if (targetRecord.access !== 'managed' || targetRecord.status !== 'active') {
    findings.push(finding('CONTEXT_TARGET_NOT_ACTIVE_MANAGED', 'workspace.projects', {
      repository: targetAgents.repository,
      access: targetRecord.access ?? null,
      status: targetRecord.status ?? null
    }));
    return;
  }

  const requiredDependencies = targetRecord.contextDependencies ?? [];
  if (!Array.isArray(requiredDependencies)) {
    findings.push(finding('CONTEXT_DEPENDENCY_REGISTRY_INVALID', 'workspace.contextDependencies'));
    return;
  }

  const requiredRepositories = new Set();
  for (const [index, dependency] of requiredDependencies.entries()) {
    const repository = dependency?.repository;
    if (
      typeof repository !== 'string'
      || repository.trim().length === 0
      || dependency?.access !== 'read-only'
      || typeof dependency?.integrationBranch !== 'string'
      || dependency.integrationBranch.trim().length === 0
    ) {
      findings.push(finding('CONTEXT_DEPENDENCY_REGISTRY_INVALID', `workspace.contextDependencies.${index}`));
      continue;
    }
    const repositoryKey = normalizeRepository(repository);
    if (requiredRepositories.has(repositoryKey)) {
      findings.push(finding('CONTEXT_DEPENDENCY_REGISTRY_INVALID', `workspace.contextDependencies.${index}`, {
        repository
      }));
      continue;
    }
    requiredRepositories.add(repositoryKey);
  }

  const actualDependencies = new Map(
    dependencies.map((dependency) => [normalizeRepository(dependency.repository), dependency])
  );
  for (const repositoryKey of requiredRepositories) {
    const declared = requiredDependencies.find((dependency) =>
      normalizeRepository(dependency?.repository) === repositoryKey
    );
    const actual = actualDependencies.get(repositoryKey);
    if (!actual) {
      findings.push(finding('CONTEXT_DEPENDENCY_UNAVAILABLE', `workspace.contextDependencies.${declared.repository}`));
      continue;
    }

    let branchSha = null;
    try {
      branchSha = integrationBranchResolver({
        repository: declared.repository,
        integrationBranch: declared.integrationBranch
      }, input);
    } catch {
      findings.push(finding('CONTEXT_DEPENDENCY_BRANCH_PROVENANCE_UNAVAILABLE', `dependencies.${declared.repository}`, {
        repository: declared.repository,
        integrationBranch: declared.integrationBranch
      }));
      continue;
    }
    if (!validSha(branchSha)) {
      findings.push(finding('CONTEXT_DEPENDENCY_BRANCH_PROVENANCE_UNAVAILABLE', `dependencies.${declared.repository}`, {
        repository: declared.repository,
        integrationBranch: declared.integrationBranch
      }));
    } else if (branchSha !== actual.revisionSha) {
      findings.push(finding('CONTEXT_DEPENDENCY_BRANCH_SHA_MISMATCH', `dependencies.${declared.repository}`, {
        repository: declared.repository,
        integrationBranch: declared.integrationBranch,
        expected: branchSha,
        actual: actual.revisionSha
      }));
    }
  }
  for (const dependency of dependencies) {
    if (!requiredRepositories.has(normalizeRepository(dependency.repository))) {
      findings.push(finding('CONTEXT_DEPENDENCY_UNEXPECTED', `dependencies.${dependency.repository}`));
    }
  }
}

function normalizeExpectedSource(source, index, findings) {
  const prefix = `expectedSources.${index}`;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    findings.push(finding('CONTEXT_EXPECTED_SOURCE_UNAVAILABLE', prefix));
    return null;
  }
  const normalized = {};
  for (const key of ['kind', 'repository', 'path']) {
    if (typeof source[key] !== 'string' || source[key].trim().length === 0) {
      findings.push(finding('CONTEXT_EXPECTED_SOURCE_UNAVAILABLE', `${prefix}.${key}`));
      return null;
    }
    normalized[key] = source[key].trim();
  }
  if (!SUPPORTED_SOURCE_KINDS.has(normalized.kind)) {
    findings.push(finding('INVALID_CONTEXT_SOURCE_KIND', `${prefix}.kind`, { actual: normalized.kind }));
    return null;
  }
  if (!validSha(source.revisionSha)) {
    findings.push(finding('INVALID_CONTEXT_SHA', `${prefix}.revisionSha`));
    return null;
  }
  normalized.revisionSha = source.revisionSha;
  return normalized;
}

function normalizeSource(source, index, findings) {
  const prefix = `sources.${index}`;
  let structurallyValid = true;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    findings.push(finding('CONTEXT_SOURCE_UNAVAILABLE', prefix));
    return null;
  }
  for (const key of ['kind', 'repository', 'path']) {
    if (typeof source[key] !== 'string' || source[key].trim().length === 0) {
      findings.push(finding('CONTEXT_SOURCE_UNAVAILABLE', `${prefix}.${key}`));
      structurallyValid = false;
    }
  }
  if (
    typeof source.kind === 'string'
    && source.kind.trim().length > 0
    && !SUPPORTED_SOURCE_KINDS.has(source.kind.trim())
  ) {
    findings.push(finding('INVALID_CONTEXT_SOURCE_KIND', `${prefix}.kind`, { actual: source.kind.trim() }));
    structurallyValid = false;
  }
  if (!validSha(source.revisionSha)) {
    findings.push(finding('INVALID_CONTEXT_SHA', `${prefix}.revisionSha`));
    structurallyValid = false;
  }
  if (!validSha(source.expectedRevisionSha)) {
    findings.push(finding('INVALID_CONTEXT_SHA', `${prefix}.expectedRevisionSha`));
    structurallyValid = false;
  }
  if (validSha(source.revisionSha) && validSha(source.expectedRevisionSha) && source.revisionSha !== source.expectedRevisionSha) {
    findings.push(finding('CONTEXT_SOURCE_STALE', prefix, { expected: source.expectedRevisionSha, actual: source.revisionSha }));
  }
  if (source.content !== undefined && typeof source.content !== 'string') {
    findings.push(finding('CONTEXT_SOURCE_UNAVAILABLE', `${prefix}.content`));
    structurallyValid = false;
  }
  if (!structurallyValid) return null;
  return {
    kind: source.kind.trim(),
    repository: source.repository.trim(),
    path: source.path.trim(),
    revisionSha: source.revisionSha,
    expectedRevisionSha: source.expectedRevisionSha,
    content: typeof source.content === 'string' ? source.content : null
  };
}

function renderSection(source) {
  return `=== ${source.kind} ${source.repository}@${source.revisionSha}:${source.path} ===\n${source.content}\n`;
}

function renderReferenceSection(source) {
  // The receipt counts against the execution budget. The entire source remains
  // Git-hydrated, authenticated, hashed and independently readable.
  return `=== verified Git reference ${source.repository}@${source.revisionSha}:${source.path} blob=${source.blobSha} sha256=${sha256(source.content)} bytes=${utf8Bytes(source.content)} (read full source at pinned SHA before decisions) ===\n`;
}

export function buildTaskContextPackage(input = {}, options = {}) {
  const findings = [];
  const sourceLoader = typeof options.sourceLoader === 'function' ? options.sourceLoader : gitSourceLoader;
  const integrationBranchResolver = typeof options.integrationBranchResolver === 'function'
    ? options.integrationBranchResolver
    : gitIntegrationBranchResolver;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { passed: false, findings: [finding('INVALID_CONTEXT_INPUT', 'input')] };
  }

  // Activation is pinned by workspace.yaml at policySha. A caller-supplied policy
  // may only short-circuit (deny before any load) and must equal the pinned one.
  const callerContextPolicy = input.contextPolicy;
  let resolvedContextPolicy = resolveContextPolicy(input, callerContextPolicy ?? DEFAULT_CONTEXT_POLICY, { newTask: input.newTask === true });
  if (callerContextPolicy !== undefined) findings.push(...resolvedContextPolicy.findings);
  let contextPolicyVersion = resolvedContextPolicy.version;
  const blockedResult = () => ({
    passed: false,
    findings,
    manifest: { contextPolicyVersion, expectedSources },
    handoffProvenance: {
      assembledContextBudgetBytes: contextPolicyVersion === 2 ? null : LEGACY_CONTEXT_MAX_BYTES,
      assembledContextActualBytes: 0,
      assembledContextCheck: 'BLOCKED'
    },
    assembledContext: ''
  });

  for (const key of ['policySha', 'baseSha', 'headSha']) {
    if (!validSha(input[key])) findings.push(finding('INVALID_CONTEXT_SHA', key));
  }

  const acceptanceText = input.acceptance?.text;
  if (typeof acceptanceText !== 'string' || acceptanceText.trim().length === 0) {
    findings.push(finding('CONTEXT_ACCEPTANCE_UNAVAILABLE', 'acceptance.text'));
  }

  const requirementIds = input.requirementIds ?? [];
  if (!uniqueStrings(requirementIds)) findings.push(finding('INVALID_CONTEXT_REQUIREMENT_IDS', 'requirementIds'));

  const expectedSources = [];
  const seenExpectedSources = new Set();
  if (!Array.isArray(input.expectedSources) || input.expectedSources.length === 0) {
    findings.push(finding('CONTEXT_EXPECTED_SOURCES_UNAVAILABLE', 'expectedSources'));
  } else {
    input.expectedSources.forEach((source, index) => {
      const normalized = normalizeExpectedSource(source, index, findings);
      if (!normalized) return;
      const key = sourceKey(normalized);
      if (seenExpectedSources.has(key)) {
        findings.push(finding('CONTEXT_EXPECTED_SOURCE_DUPLICATE', `expectedSources.${index}`));
        return;
      }
      seenExpectedSources.add(key);
      expectedSources.push(normalized);
    });
  }

  validateCanonicalExpectedSources(expectedSources, input.policySha, input.headSha, input.role, findings);
  if (callerContextPolicy !== undefined && !resolvedContextPolicy.admitted) return blockedResult();

  const dependencies = input.dependencies ?? [];
  if (!Array.isArray(dependencies)) {
    findings.push(finding('INVALID_CONTEXT_DEPENDENCIES', 'dependencies'));
  }
  const normalizedDependencies = [];
  const seenDependencies = new Set();
  if (Array.isArray(dependencies)) {
    dependencies.forEach((dependency, index) => {
      const prefix = `dependencies.${index}`;
      if (!dependency || typeof dependency !== 'object' || Array.isArray(dependency) || typeof dependency.repository !== 'string' || dependency.repository.length === 0) {
        findings.push(finding('CONTEXT_DEPENDENCY_UNAVAILABLE', prefix));
        return;
      }
      const dependencyKey = normalizeRepository(dependency.repository);
      if (seenDependencies.has(dependencyKey)) findings.push(finding('CONTEXT_DEPENDENCY_DUPLICATE', prefix));
      seenDependencies.add(dependencyKey);
      if (!validSha(dependency.revisionSha)) findings.push(finding('INVALID_CONTEXT_SHA', `${prefix}.revisionSha`));
      if (!validSha(dependency.expectedRevisionSha)) findings.push(finding('INVALID_CONTEXT_SHA', `${prefix}.expectedRevisionSha`));
      if (validSha(dependency.revisionSha) && validSha(dependency.expectedRevisionSha) && dependency.revisionSha !== dependency.expectedRevisionSha) {
        findings.push(finding('CONTEXT_DEPENDENCY_STALE', prefix, { expected: dependency.expectedRevisionSha, actual: dependency.revisionSha }));
      }
      if (validSha(dependency.revisionSha) && validSha(dependency.expectedRevisionSha)) {
        normalizedDependencies.push({ repository: dependency.repository, revisionSha: dependency.revisionSha });
      }
    });
  }

  const sources = [];
  const seenSources = new Set();
  const expectedSourceKeys = new Set(expectedSources.map(sourceKey));
  const targetAgentSource = expectedSources.find((source) => source.kind === 'target' && source.path === 'AGENTS.md');
  // Target instructions must belong to the repository the handoff executes in,
  // even when another repository (for example a fork) shares the pinned commit.
  const handoffRepository = typeof input.repository === 'string' && input.repository.trim() !== ''
    ? input.repository.trim()
    : null;
  const targetRepositoryMatches = (repository) => handoffRepository === null
    || normalizeRepository(repository) === normalizeRepository(handoffRepository);
  if (targetAgentSource !== undefined && !targetRepositoryMatches(targetAgentSource.repository)) {
    findings.push(finding('CONTEXT_TARGET_REPOSITORY_MISMATCH', 'expectedSources', {
      expected: handoffRepository,
      actual: targetAgentSource.repository
    }));
  }
  const canonicalSourceAuthorized = (source) => {
    if (source.kind === 'policy') {
      return normalizeRepository(source.repository) === CANONICAL_POLICY_REPOSITORY
        && CANONICAL_POLICY_PATHS.includes(source.path)
        && source.revisionSha === input.policySha;
    }
    if (source.kind === 'role') {
      return normalizeRepository(source.repository) === CANONICAL_POLICY_REPOSITORY
        && source.path === CANONICAL_HANDOFF_ROLE_PATH
        && source.revisionSha === input.policySha;
    }
    if (source.kind === 'target') {
      return targetAgentSource !== undefined
        && targetRepositoryMatches(source.repository)
        && normalizeRepository(source.repository) === normalizeRepository(targetAgentSource.repository)
        && source.revisionSha === input.headSha;
    }
    if (source.kind === 'reference') {
      return targetAgentSource !== undefined
        && source.path === 'docs/PRODUCT.md'
        && targetRepositoryMatches(source.repository)
        && normalizeRepository(source.repository) === normalizeRepository(targetAgentSource.repository)
        && source.revisionSha === input.headSha;
    }
    return normalizedDependencies.some((dependency) =>
      normalizeRepository(dependency.repository) === normalizeRepository(source.repository)
      && dependency.revisionSha === source.revisionSha
    );
  };
  let registryDependencies = new Set();
  let pinnedPolicyForManifest = null;
  const hydratedByIndex = [];
  const processSource = (source, index) => {
      const normalized = normalizeSource(source, index, findings);
      if (!normalized) return;
      const key = sourceKey(normalized);
      if (seenSources.has(key)) {
        findings.push(finding('CONTEXT_SOURCE_DUPLICATE', `sources.${index}`));
        return;
      }
      if (!expectedSourceKeys.has(key)) {
        findings.push(finding('CONTEXT_SOURCE_UNEXPECTED', `sources.${index}`));
        return;
      }
      // Dependencies must be declared by the pinned workspace registry BEFORE any Git read.
      if (normalized.kind === 'dependency' && !registryDependencies.has(normalizeRepository(normalized.repository))) {
        findings.push(finding('CONTEXT_DEPENDENCY_UNEXPECTED', `sources.${index}`, { repository: normalized.repository }));
        return;
      }
      if (normalized.kind === 'dependency' && !normalizedDependencies.some((dependency) =>
        normalizeRepository(dependency.repository) === normalizeRepository(normalized.repository)
        && dependency.revisionSha === normalized.revisionSha
      )) {
        findings.push(finding('CONTEXT_DEPENDENCY_SOURCE_UNDECLARED', `sources.${index}`, {
          repository: normalized.repository,
          revisionSha: normalized.revisionSha
        }));
        return;
      }
      if (!canonicalSourceAuthorized(normalized)) {
        findings.push(finding('CONTEXT_SOURCE_UNEXPECTED', `sources.${index}`));
        return;
      }
      if (normalized.revisionSha !== normalized.expectedRevisionSha) return;
      const hydrated = hydrateSource(normalized, index, input, findings, sourceLoader);
      if (!hydrated) return;
      seenSources.add(key);
      hydratedByIndex[index] = hydrated;
  };
  if (!Array.isArray(input.sources) || input.sources.length === 0) {
    findings.push(finding('CONTEXT_SOURCE_UNAVAILABLE', 'sources'));
  } else {
    // Pass 1: canonical policy/role sources (always authorized at policySha).
    input.sources.forEach((source, index) => {
      if (POLICY_BOUND_KINDS.has(source?.kind)) processSource(source, index);
    });

    const workspaceSource = hydratedByIndex.find((source) => source
      && source.kind === 'policy'
      && normalizeRepository(source.repository) === CANONICAL_POLICY_REPOSITORY
      && source.path === 'workspace.yaml'
      && source.revisionSha === input.policySha);
    let pinnedContextPolicy = null;
    if (workspaceSource) {
      try {
        const workspace = parse(workspaceSource.content);
        pinnedContextPolicy = workspace?.contextPolicy ?? DEFAULT_CONTEXT_POLICY;
        const targetRepository = handoffRepository ?? targetAgentSource?.repository;
        const records = (Array.isArray(workspace?.projects) ? workspace.projects : [])
          .filter((project) => normalizeRepository(project?.repository) === normalizeRepository(targetRepository));
        if (records.length === 1 && Array.isArray(records[0].contextDependencies)) {
          registryDependencies = new Set(records[0].contextDependencies
            .map((dependency) => normalizeRepository(dependency?.repository))
            .filter(Boolean));
        }
      } catch {
        findings.push(finding('CONTEXT_WORKSPACE_REGISTRY_UNAVAILABLE', 'sources.workspace.yaml'));
      }
    }
    if (pinnedContextPolicy === null) {
      findings.push(finding('CONTEXT_POLICY_UNPINNED', 'sources.workspace.yaml'));
      return blockedResult();
    }
    if (callerContextPolicy !== undefined
      && canonicalContextPolicy(callerContextPolicy) !== canonicalContextPolicy(pinnedContextPolicy)) {
      findings.push(finding('CONTEXT_POLICY_NOT_PINNED', 'contextPolicy'));
      return blockedResult();
    }
    resolvedContextPolicy = resolveContextPolicy(input, pinnedContextPolicy, { newTask: input.newTask === true });
    if (callerContextPolicy === undefined) findings.push(...resolvedContextPolicy.findings);
    contextPolicyVersion = resolvedContextPolicy.version;
    if (!resolvedContextPolicy.admitted) return blockedResult();
    pinnedPolicyForManifest = pinnedContextPolicy;
    // v2 evidence must be bound to exactly one task and its approved scope.
    if (contextPolicyVersion === 2 && (typeof input.taskId !== 'string' || input.taskId.trim() === '' || !approvalScopeDigest(input.approval))) {
      findings.push(finding('CONTEXT_TASK_BINDING_UNAVAILABLE', 'taskId'));
      return blockedResult();
    }

    // Pass 2: target, reference and dependency sources, only after authorization.
    input.sources.forEach((source, index) => {
      if (!POLICY_BOUND_KINDS.has(source?.kind)) processSource(source, index);
    });
    sources.push(...hydratedByIndex.filter(Boolean));
  }

  validateRequiredContextDependencies(
    sources,
    normalizedDependencies,
    input.policySha,
    input,
    findings,
    integrationBranchResolver
  );

  if (validSha(input.policySha)) {
    expectedSources.forEach((source, index) => {
      if (POLICY_BOUND_KINDS.has(source.kind) && source.revisionSha !== input.policySha) {
        findings.push(finding('CONTEXT_POLICY_SHA_MISMATCH', `expectedSources.${index}.revisionSha`, {
          expected: input.policySha,
          actual: source.revisionSha
        }));
      }
    });
    sources.forEach((source, index) => {
      if (POLICY_BOUND_KINDS.has(source.kind) && source.revisionSha !== input.policySha) {
        findings.push(finding('CONTEXT_POLICY_SHA_MISMATCH', `sources.${index}.revisionSha`, {
          expected: input.policySha,
          actual: source.revisionSha
        }));
      }
    });
  }

  for (const [index, expectedSource] of expectedSources.entries()) {
    if (!seenSources.has(sourceKey(expectedSource))) {
      findings.push(finding('CONTEXT_EXPECTED_SOURCE_UNAVAILABLE', `expectedSources.${index}`, { expected: expectedSource }));
    }
  }
  for (const [index, source] of sources.entries()) {
    if (!expectedSourceKeys.has(sourceKey(source))) {
      findings.push(finding('CONTEXT_SOURCE_UNEXPECTED', `sources.${index}`, {
        actual: {
          kind: source.kind,
          repository: source.repository,
          path: source.path,
          revisionSha: source.revisionSha
        }
      }));
    }
  }

  if (validSha(input.policySha) && !sources.some(({ kind, revisionSha }) => kind === 'policy' && revisionSha === input.policySha)) {
    findings.push(finding('CONTEXT_POLICY_UNAVAILABLE', 'sources'));
  }

  for (const dependency of normalizedDependencies) {
    if (!sources.some(({ repository, revisionSha }) =>
      normalizeRepository(repository) === normalizeRepository(dependency.repository)
      && revisionSha === dependency.revisionSha
    )) {
      findings.push(finding('CONTEXT_DEPENDENCY_UNAVAILABLE', `dependencies.${dependency.repository}`));
    }
  }
  for (const [index, source] of sources.entries()) {
    if (
      source.kind === 'dependency'
      && !normalizedDependencies.some((dependency) =>
        normalizeRepository(dependency.repository) === normalizeRepository(source.repository)
        && dependency.revisionSha === source.revisionSha
      )
    ) {
      findings.push(finding('CONTEXT_DEPENDENCY_SOURCE_UNDECLARED', `sources.${index}`, {
        repository: source.repository,
        revisionSha: source.revisionSha
      }));
    }
  }

  if (uniqueStrings(requirementIds)) {
    // A referenced PRODUCT is the sole authority for declared requirement IDs.
    // Never satisfy one from an unrelated inline mention if its PRODUCT row is missing.
    const productReference = sources.find((source) => source.kind === 'reference');
    for (const requirementId of requirementIds) {
      const found = productReference
        ? productReference.content.split('\n').some((line) =>
          /^\|\s*([A-Z]+-\d{3})\s*\|/u.exec(line)?.[1] === requirementId
        )
        : sources.some(({ content }) => content.includes(requirementId));
      if (!found) {
        findings.push(finding('CONTEXT_REQUIREMENT_UNAVAILABLE', `requirementIds.${requirementId}`));
      }
    }
  }

  const sections = [];
  if (typeof acceptanceText === 'string' && acceptanceText.length > 0) {
    sections.push(`=== acceptance ===\n${acceptanceText}\n`);
  }
  sections.push(...sources.map((source) =>
    source.kind === 'reference' ? renderReferenceSection(source) : renderSection(source)
  ));
  const assembledContext = sections.join('\n');
  const measured = contextPolicyVersion === 2
    ? evaluateContextBytes(contextPolicyVersion, assembledContext)
    : checkAssembledExecutionContext([assembledContext]);
  findings.push(...measured.findings);

  const passed = findings.length === 0 && measured.actualBytes > 0;
  const manifest = {
    role: input.role === CANONICAL_HANDOFF_ROLE ? input.role : null,
    contextPolicyVersion,
    contextPolicy: pinnedPolicyForManifest,
    repository: handoffRepository,
    taskId: typeof input.taskId === 'string' && input.taskId.trim() !== '' ? input.taskId : null,
    approval: approvalScopeDigest(input.approval)
      ? { reference: input.approval.reference ?? null, scopeSha256: approvalScopeDigest(input.approval) }
      : null,
    policySha: validSha(input.policySha) ? input.policySha : null,
    baseSha: validSha(input.baseSha) ? input.baseSha : null,
    headSha: validSha(input.headSha) ? input.headSha : null,
    acceptance: typeof acceptanceText === 'string'
      ? { sha256: sha256(acceptanceText), bytes: utf8Bytes(acceptanceText) }
      : null,
    requirementIds: uniqueStrings(requirementIds) ? [...requirementIds] : [],
    acceptanceIds: uniqueStrings(input.acceptanceIds ?? []) ? [...(input.acceptanceIds ?? [])] : [],
    mandatorySourceIds: expectedSources
      .filter((source) => source.kind !== 'reference')
      .map(coverageSourceId),
    expectedSources,
    dependencies: normalizedDependencies,
    sources: sources.map((source) => ({
      kind: source.kind,
      repository: source.repository,
      path: source.path,
      revisionSha: source.revisionSha,
      blobSha: source.blobSha,
      sha256: sha256(source.content),
      bytes: utf8Bytes(source.content),
      assembly: source.kind === 'reference' ? 'verified-reference' : 'inline'
    })),
    assembledContextSha256: sha256(assembledContext),
    assembledContextBudgetBytes: measured.maxBytes,
    assembledContextActualBytes: measured.actualBytes,
    assembledContextCheck: passed ? 'PASSED' : 'BLOCKED'
  };

  return {
    passed,
    findings,
    manifest,
    handoffProvenance: {
      assembledContextBudgetBytes: measured.maxBytes,
      assembledContextActualBytes: measured.actualBytes,
      assembledContextCheck: manifest.assembledContextCheck
    },
    assembledContext
  };
}

function readInput() {
  const path = process.argv[2];
  return path ? readFileSync(path, 'utf8') : readFileSync(0, 'utf8');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = buildTaskContextPackage(JSON.parse(readInput()));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ passed: false, findings: [{ code: 'INVALID_CONTEXT_INPUT', path: 'input', message: error.message }] })}\n`);
    process.exitCode = 2;
  }
}

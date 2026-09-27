import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const DEFAULT_MANIFEST_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../workspace.yaml');
export const ASSEMBLED_EXECUTION_CONTEXT_BUDGET_KEY = 'assembled execution context';
export const ASSEMBLED_EXECUTION_CONTEXT_BUDGET = 32768;

export const HARD_BUDGETS = Object.freeze({
  'AI.md': 1024,
  'FLOW.md': 2048,
  'global role file': 6144,
  'managed AGENTS block': 1024,
  '.ai/context.md': 8192,
  'one decision record': 4096,
  'prompt.md': 8192,
  'state.md': 2048,
  [ASSEMBLED_EXECUTION_CONTEXT_BUDGET_KEY]: ASSEMBLED_EXECUTION_CONTEXT_BUDGET,
  'result.md': 4096,
  'human plan.md': 16384
});

const MANIFEST_KEYS = new Set(['schemaVersion', 'canonicalRoot', 'budgets', 'gitLifecycle', 'projects']);
const PROJECT_KEYS = new Set(['id', 'repository', 'localPath', 'group', 'access', 'status', 'integrationBranch', 'contextPath', 'contextDependencies']);
const DEPENDENCY_KEYS = new Set(['repository', 'integrationBranch', 'access']);
const GIT_LIFECYCLE_KEYS = new Set(['canonicalBranch', 'normalMergeMethod', 'productionPromotion', 'temporaryIssueBranchPattern', 'repositories']);
const GIT_LIFECYCLE_REPOSITORY_KEYS = new Set(['repository', 'deploymentProfile', 'branchState', 'defaultBranch', 'integrationBranch', 'promotionBranch', 'exception']);
const GIT_LIFECYCLE_EXCEPTION_KEYS = new Set(['reason', 'followUp']);
const BUDGET_KEYS = new Set(Object.keys(HARD_BUDGETS));
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_RELATIVE_PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const CENTRAL_REPOSITORY = 'syllik/ai-workflow';

function finding(code, path, details = {}) {
  return { code, path, ...details };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function checkUnknownKeys(value, allowed, prefix, findings) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value).sort()) {
    if (!allowed.has(key)) findings.push(finding('UNKNOWN_KEY', `${prefix}.${key}`));
  }
}

function isSafeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.includes('\\')
    && !value.includes('\0')
    && SAFE_RELATIVE_PATH.test(value)
    && !value.split('/').some((part) => part === '.' || part === '..');
}

function isExcludedRepository(repository) {
  return typeof repository === 'string'
    && (/^tangem(?:\/|$)/i.test(repository) || /syllik\.github\.io/i.test(repository));
}

function normalizedRepository(repository) {
  return typeof repository === 'string' ? repository.toLowerCase() : repository;
}

function checkDuplicates(projects, findings) {
  const seen = new Map();
  for (const field of ['id', 'repository', 'localPath']) {
    seen.clear();
    projects.forEach((project, index) => {
      const value = project?.[field];
      if (typeof value !== 'string') return;
      if (seen.has(value)) findings.push(finding(`DUPLICATE_${field === 'localPath' ? 'LOCAL_PATH' : field.toUpperCase()}`, `manifest.projects[${index}].${field}`));
      else seen.set(value, index);
    });
  }
}

export function loadManifest(manifestPath) {
  return parse(readFileSync(manifestPath, 'utf8'));
}

export function validateActivationBaseManifest(value) {
  const findings = [];
  if (!isObject(value)) {
    return { valid: false, findings: [finding('INVALID_ACTIVATION_BASE_MANIFEST', 'manifest')] };
  }
  if (!Array.isArray(value.projects)) {
    return { valid: false, findings: [finding('INVALID_ACTIVATION_BASE_PROJECTS', 'manifest.projects')] };
  }

  const seenRepositories = new Set();
  value.projects.forEach((project, index) => {
    const projectPath = `manifest.projects[${index}]`;
    if (!isObject(project)) {
      findings.push(finding('INVALID_ACTIVATION_BASE_PROJECT', projectPath));
      return;
    }

    if (typeof project.repository !== 'string' || !REPOSITORY_PATTERN.test(project.repository)) {
      findings.push(finding('INVALID_ACTIVATION_BASE_REPOSITORY', `${projectPath}.repository`));
    } else {
      const normalized = normalizedRepository(project.repository);
      if (seenRepositories.has(normalized)) {
        findings.push(finding('DUPLICATE_ACTIVATION_BASE_REPOSITORY', `${projectPath}.repository`));
      } else {
        seenRepositories.add(normalized);
      }
    }
    if (!['managed', 'read-only'].includes(project.access)) {
      findings.push(finding('INVALID_ACTIVATION_BASE_ACCESS', `${projectPath}.access`));
    }
    if (!['onboarding', 'active'].includes(project.status)) {
      findings.push(finding('INVALID_ACTIVATION_BASE_STATUS', `${projectPath}.status`));
    }
    if (!isSafeRelativePath(project.integrationBranch)) {
      findings.push(finding('INVALID_ACTIVATION_BASE_BRANCH', `${projectPath}.integrationBranch`));
    }
  });

  return { valid: findings.length === 0, findings };
}

function validateGitLifecycle(value, projects, findings) {
  const lifecyclePath = 'manifest.gitLifecycle';
  if (!isObject(value)) {
    findings.push(finding('INVALID_GIT_LIFECYCLE', lifecyclePath));
    return;
  }

  checkUnknownKeys(value, GIT_LIFECYCLE_KEYS, lifecyclePath, findings);
  if (value.canonicalBranch !== 'master') findings.push(finding('INVALID_CANONICAL_BRANCH_POLICY', `${lifecyclePath}.canonicalBranch`));
  if (value.normalMergeMethod !== 'squash') findings.push(finding('INVALID_NORMAL_MERGE_METHOD', `${lifecyclePath}.normalMergeMethod`));
  if (value.productionPromotion !== 'exact-commit') findings.push(finding('INVALID_PRODUCTION_PROMOTION', `${lifecyclePath}.productionPromotion`));
  if (value.temporaryIssueBranchPattern !== '<type>/issue-<number>-<slug>') {
    findings.push(finding('INVALID_TEMPORARY_BRANCH_PATTERN', `${lifecyclePath}.temporaryIssueBranchPattern`));
  }

  if (!Array.isArray(value.repositories)) {
    findings.push(finding('INVALID_GIT_LIFECYCLE_REPOSITORIES', `${lifecyclePath}.repositories`));
    return;
  }
  if (value.repositories.length === 0) {
    if (Array.isArray(projects) && projects.length > 0) {
      findings.push(finding('INVALID_GIT_LIFECYCLE_REPOSITORIES', `${lifecyclePath}.repositories`));
    }
    return;
  }

  const projectByRepository = new Map(
    (Array.isArray(projects) ? projects : [])
      .filter((project) => isObject(project) && typeof project.repository === 'string')
      .map((project) => [normalizedRepository(project.repository), project])
  );
  const seenRepositories = new Set();

  value.repositories.forEach((entry, index) => {
    const entryPath = `${lifecyclePath}.repositories[${index}]`;
    if (!isObject(entry)) {
      findings.push(finding('INVALID_GIT_LIFECYCLE_REPOSITORY', entryPath));
      return;
    }

    checkUnknownKeys(entry, GIT_LIFECYCLE_REPOSITORY_KEYS, entryPath, findings);

    const repositoryValid = typeof entry.repository === 'string' && REPOSITORY_PATTERN.test(entry.repository);
    if (!repositoryValid) {
      findings.push(finding('INVALID_LIFECYCLE_REPOSITORY', `${entryPath}.repository`));
    } else {
      const normalized = normalizedRepository(entry.repository);
      if (seenRepositories.has(normalized)) findings.push(finding('DUPLICATE_LIFECYCLE_REPOSITORY', `${entryPath}.repository`));
      seenRepositories.add(normalized);

      const project = projectByRepository.get(normalized);
      if (!project) findings.push(finding('LIFECYCLE_PROJECT_NOT_FOUND', `${entryPath}.repository`));
      else if (project.integrationBranch !== entry.integrationBranch) {
        findings.push(finding('LIFECYCLE_INTEGRATION_BRANCH_MISMATCH', `${entryPath}.integrationBranch`, {
          expected: project.integrationBranch,
          actual: entry.integrationBranch
        }));
      }
    }

    if (!['none', 'staging', 'production'].includes(entry.deploymentProfile)) {
      findings.push(finding('INVALID_DEPLOYMENT_PROFILE', `${entryPath}.deploymentProfile`));
    }
    if (!['canonical', 'migration', 'temporary-exception'].includes(entry.branchState)) {
      findings.push(finding('INVALID_BRANCH_STATE', `${entryPath}.branchState`));
    }
    if (!isSafeRelativePath(entry.defaultBranch)) findings.push(finding('INVALID_DEFAULT_BRANCH', `${entryPath}.defaultBranch`));
    if (!isSafeRelativePath(entry.integrationBranch)) findings.push(finding('INVALID_LIFECYCLE_INTEGRATION_BRANCH', `${entryPath}.integrationBranch`));

    if (entry.branchState === 'canonical') {
      if (entry.defaultBranch !== 'master' || entry.integrationBranch !== 'master' || entry.promotionBranch !== undefined || entry.exception !== undefined) {
        findings.push(finding('INVALID_BRANCH_STATE_COMBINATION', `${entryPath}.branchState`));
      }
    } else if (entry.branchState === 'migration') {
      if ((entry.defaultBranch === 'master' && entry.integrationBranch === 'master') || entry.promotionBranch !== undefined || entry.exception !== undefined) {
        findings.push(finding('INVALID_BRANCH_STATE_COMBINATION', `${entryPath}.branchState`));
      }
    } else if (entry.branchState === 'temporary-exception') {
      if (entry.defaultBranch === 'master' && entry.integrationBranch === 'master') {
        findings.push(finding('INVALID_BRANCH_STATE_COMBINATION', `${entryPath}.branchState`));
      }
      if (!isSafeRelativePath(entry.promotionBranch) || entry.promotionBranch !== entry.defaultBranch) {
        findings.push(finding('INVALID_PROMOTION_BRANCH', `${entryPath}.promotionBranch`));
      }
      if (!isObject(entry.exception)) {
        findings.push(finding('UNRECORDED_LIFECYCLE_EXCEPTION', `${entryPath}.exception`));
      } else {
        checkUnknownKeys(entry.exception, GIT_LIFECYCLE_EXCEPTION_KEYS, `${entryPath}.exception`, findings);
        if (!isNonEmptyString(entry.exception.reason)) findings.push(finding('UNRECORDED_LIFECYCLE_EXCEPTION', `${entryPath}.exception.reason`));
        if (!isNonEmptyString(entry.exception.followUp)) findings.push(finding('UNRECORDED_LIFECYCLE_EXCEPTION', `${entryPath}.exception.followUp`));
      }
    }
  });
}

export function validateManifest(value) {
  const findings = [];
  if (!isObject(value)) {
    return { valid: false, findings: [finding('INVALID_MANIFEST', 'manifest')] };
  }

  checkUnknownKeys(value, MANIFEST_KEYS, 'manifest', findings);
  if (value.schemaVersion !== 2) findings.push(finding('INVALID_SCHEMA_VERSION', 'manifest.schemaVersion'));
  if (value.canonicalRoot !== '~/Desktop/WORK') findings.push(finding('INVALID_CANONICAL_ROOT', 'manifest.canonicalRoot'));

  if (!isObject(value.budgets)) {
    findings.push(finding('INVALID_BUDGETS', 'manifest.budgets'));
  } else {
    checkUnknownKeys(value.budgets, BUDGET_KEYS, 'manifest.budgets', findings);
    for (const [key, maximum] of Object.entries(HARD_BUDGETS)) {
      if (value.budgets[key] !== maximum) findings.push(finding('INVALID_BUDGET', `manifest.budgets.${key}`));
    }
  }

  validateGitLifecycle(value.gitLifecycle, value.projects, findings);

  if (!Array.isArray(value.projects)) {
    findings.push(finding('INVALID_PROJECTS', 'manifest.projects'));
  } else {
    value.projects.forEach((project, index) => {
      const projectPath = `manifest.projects[${index}]`;
      if (!isObject(project)) {
        findings.push(finding('INVALID_PROJECT', projectPath));
        return;
      }
      checkUnknownKeys(project, PROJECT_KEYS, projectPath, findings);
      if (typeof project.id !== 'string' || !REPOSITORY_PATTERN.test(project.id)) findings.push(finding('INVALID_ID', `${projectPath}.id`));
      if (typeof project.repository !== 'string' || !REPOSITORY_PATTERN.test(project.repository)) findings.push(finding('INVALID_REPOSITORY', `${projectPath}.repository`));
      if (!isSafeRelativePath(project.localPath)) findings.push(finding('UNSAFE_PATH', `${projectPath}.localPath`));
      if (typeof project.group !== 'string' || !isSafeRelativePath(project.group)) findings.push(finding('INVALID_GROUP', `${projectPath}.group`));
      if (!isSafeRelativePath(project.integrationBranch)) findings.push(finding('INVALID_INTEGRATION_BRANCH', `${projectPath}.integrationBranch`));
      else if (normalizedRepository(project.repository) === CENTRAL_REPOSITORY && project.integrationBranch !== 'master') findings.push(finding('INVALID_CENTRAL_INTEGRATION_BRANCH', `${projectPath}.integrationBranch`));
      if (!['managed', 'read-only'].includes(project.access)) findings.push(finding('INVALID_ACCESS', `${projectPath}.access`));
      if (!['onboarding', 'active'].includes(project.status)) findings.push(finding('INVALID_STATUS', `${projectPath}.status`));
      if (project.contextPath !== undefined && !isSafeRelativePath(project.contextPath)) findings.push(finding('UNSAFE_PATH', `${projectPath}.contextPath`));
      if (project.access === 'managed' && project.contextPath === undefined) findings.push(finding('MANAGED_CONTEXT_REQUIRED', `${projectPath}.contextPath`));
      else if (project.access === 'managed' && project.contextPath !== '.ai/context.md') findings.push(finding('MANAGED_CONTEXT_PATH_INVALID', `${projectPath}.contextPath`));
      if (project.access === 'read-only' && project.contextPath !== undefined) findings.push(finding('READ_ONLY_CONTEXT_FORBIDDEN', `${projectPath}.contextPath`));
      if (project.access === 'read-only' && project.status !== 'active') findings.push(finding('INVALID_COMBINATION', `${projectPath}.status`));
      if (project.contextDependencies !== undefined) {
        if (!Array.isArray(project.contextDependencies)) {
          findings.push(finding('INVALID_CONTEXT_DEPENDENCIES', `${projectPath}.contextDependencies`));
        } else {
          const dependencyRepositories = new Set();
          project.contextDependencies.forEach((dependency, dependencyIndex) => {
            const dependencyPath = `${projectPath}.contextDependencies[${dependencyIndex}]`;
            if (!isObject(dependency)) {
              findings.push(finding('INVALID_CONTEXT_DEPENDENCY', dependencyPath));
              return;
            }
            checkUnknownKeys(dependency, DEPENDENCY_KEYS, dependencyPath, findings);
            if (typeof dependency.repository !== 'string' || !REPOSITORY_PATTERN.test(dependency.repository)) {
              findings.push(finding('INVALID_DEPENDENCY_REPOSITORY', `${dependencyPath}.repository`));
            }
            if (isExcludedRepository(dependency.repository)) {
              findings.push(finding('EXCLUDED_REPOSITORY', `${dependencyPath}.repository`));
            }
            if (!isSafeRelativePath(dependency.integrationBranch)) {
              findings.push(finding('INVALID_DEPENDENCY_BRANCH', `${dependencyPath}.integrationBranch`));
            }
            if (dependency.access !== 'read-only') {
              findings.push(finding('INVALID_DEPENDENCY_ACCESS', `${dependencyPath}.access`));
            }
            const normalizedDependencyRepository = normalizedRepository(dependency.repository);
            const normalizedProjectRepository = normalizedRepository(project.repository);
            if (normalizedDependencyRepository === normalizedProjectRepository) {
              findings.push(finding('SELF_CONTEXT_DEPENDENCY', `${dependencyPath}.repository`));
            }
            if (typeof dependency.repository === 'string') {
              if (dependencyRepositories.has(normalizedDependencyRepository)) {
                findings.push(finding('DUPLICATE_CONTEXT_DEPENDENCY', `${dependencyPath}.repository`));
              }
              dependencyRepositories.add(normalizedDependencyRepository);
            }
          });
        }
      }
    });
    checkDuplicates(value.projects, findings);
    value.projects.forEach((project, index) => {
      if (isExcludedRepository(project?.repository)) {
        findings.push(finding('EXCLUDED_REPOSITORY', `manifest.projects[${index}].repository`));
      }
    });
  }

  return { valid: findings.length === 0, findings };
}

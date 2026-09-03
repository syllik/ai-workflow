import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export const REQUIRED_PROJECTS = Object.freeze([
  { id: 'syllik/syllik', repository: 'syllik/syllik', localPath: 'profile/syllik', group: 'profile', access: 'managed', status: 'onboarding', contextPath: '.ai/context.md' },
  { id: 'ChipIn-one/chipin-frontend', repository: 'ChipIn-one/chipin-frontend', localPath: 'products/chipin/chipin-frontend', group: 'products/chipin', access: 'managed', status: 'onboarding', contextPath: '.ai/context.md' },
  { id: 'ChipIn-one/chipin-backend', repository: 'ChipIn-one/chipin-backend', localPath: 'products/chipin/chipin-backend', group: 'products/chipin', access: 'read-only', status: 'active' },
  { id: 'syllik/chatgpt-archive-cleanup', repository: 'syllik/chatgpt-archive-cleanup', localPath: 'tools/ai/chatgpt-archive-cleanup', group: 'tools/ai', access: 'managed', status: 'onboarding', contextPath: '.ai/context.md' },
  { id: 'syllik/codex-local-runner', repository: 'syllik/codex-local-runner', localPath: 'tools/ai/codex-local-runner', group: 'tools/ai', access: 'managed', status: 'onboarding', contextPath: '.ai/context.md' },
  { id: 'syllik/youtube-metadata-translator', repository: 'syllik/youtube-metadata-translator', localPath: 'tools/content/youtube-metadata-translator', group: 'tools/content', access: 'managed', status: 'onboarding', contextPath: '.ai/context.md' },
  { id: 'syllik/ai-workflow', repository: 'syllik/ai-workflow', localPath: 'workflows/ai/ai-workflow', group: 'workflows/ai', access: 'managed', status: 'active', contextPath: '.ai/context.md' },
  { id: 'syllik/gpg-signed-commits', repository: 'syllik/gpg-signed-commits', localPath: 'guides/git/gpg-signed-commits', group: 'guides/git', access: 'managed', status: 'onboarding', contextPath: '.ai/context.md' }
]);

export const HARD_BUDGETS = Object.freeze({
  'AI.md': 1024,
  'FLOW.md': 2048,
  'global role file': 6144,
  'managed AGENTS block': 1024,
  '.ai/context.md': 8192,
  'one decision record': 4096,
  'prompt.md': 8192,
  'state.md': 2048,
  'result.md': 4096,
  'human plan.md': 16384
});

const MANIFEST_KEYS = new Set(['schemaVersion', 'canonicalRoot', 'budgets', 'projects']);
const PROJECT_KEYS = new Set(['id', 'repository', 'localPath', 'group', 'access', 'status', 'contextPath']);
const BUDGET_KEYS = new Set(Object.keys(HARD_BUDGETS));
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_RELATIVE_PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

function finding(code, path, details = {}) {
  return { code, path, ...details };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function canonicalProjectShape(project) {
  return Object.fromEntries([...PROJECT_KEYS].map((key) => [key, project[key]]));
}

function sameProjectSet(projects) {
  if (!Array.isArray(projects) || projects.length !== REQUIRED_PROJECTS.length) return false;
  const actual = projects.map(canonicalProjectShape).sort((left, right) => left.id.localeCompare(right.id));
  const expected = REQUIRED_PROJECTS.map(canonicalProjectShape).sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify(actual) === JSON.stringify(expected);
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

export function validateManifest(value) {
  const findings = [];
  if (!isObject(value)) {
    return { valid: false, findings: [finding('INVALID_MANIFEST', 'manifest')] };
  }

  checkUnknownKeys(value, MANIFEST_KEYS, 'manifest', findings);
  if (value.schemaVersion !== 1) findings.push(finding('INVALID_SCHEMA_VERSION', 'manifest.schemaVersion'));
  if (value.canonicalRoot !== '~/Desktop/WORK') findings.push(finding('INVALID_CANONICAL_ROOT', 'manifest.canonicalRoot'));

  if (!isObject(value.budgets)) {
    findings.push(finding('INVALID_BUDGETS', 'manifest.budgets'));
  } else {
    checkUnknownKeys(value.budgets, BUDGET_KEYS, 'manifest.budgets', findings);
    for (const [key, maximum] of Object.entries(HARD_BUDGETS)) {
      if (value.budgets[key] !== maximum) findings.push(finding('INVALID_BUDGET', `manifest.budgets.${key}`));
    }
  }

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
      if (!['managed', 'read-only'].includes(project.access)) findings.push(finding('INVALID_ACCESS', `${projectPath}.access`));
      if (!['onboarding', 'active'].includes(project.status)) findings.push(finding('INVALID_STATUS', `${projectPath}.status`));
      if (project.contextPath !== undefined && !isSafeRelativePath(project.contextPath)) findings.push(finding('UNSAFE_PATH', `${projectPath}.contextPath`));
      if (project.access === 'managed' && !project.contextPath) findings.push(finding('MANAGED_CONTEXT_REQUIRED', `${projectPath}.contextPath`));
      if (project.access === 'read-only' && project.contextPath !== undefined) findings.push(finding('READ_ONLY_CONTEXT_FORBIDDEN', `${projectPath}.contextPath`));
      if (project.access === 'read-only' && project.status !== 'active') findings.push(finding('INVALID_COMBINATION', `${projectPath}.status`));
    });
    checkDuplicates(value.projects, findings);
    value.projects.forEach((project, index) => {
      if (typeof project?.repository === 'string' && (/^tangem(?:\/|$)/i.test(project.repository) || /syllik\.github\.io/i.test(project.repository))) {
        findings.push(finding('EXCLUDED_REPOSITORY', `manifest.projects[${index}].repository`));
      }
    });
    if (!sameProjectSet(value.projects)) findings.push(finding('PROJECT_SET_MISMATCH', 'manifest.projects'));
  }

  return { valid: findings.length === 0, findings };
}

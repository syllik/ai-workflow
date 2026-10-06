import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkAssembledExecutionContext, utf8Bytes } from './budgets.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;

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
    && value.every((entry) => typeof entry === 'string' && entry.length > 0)
    && new Set(value).size === value.length;
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
  if (typeof source.content !== 'string' || source.content.length === 0) {
    findings.push(finding('CONTEXT_SOURCE_UNAVAILABLE', `${prefix}.content`));
    structurallyValid = false;
  }
  if (source.requirementIds !== undefined && !uniqueStrings(source.requirementIds)) {
    findings.push(finding('INVALID_CONTEXT_REQUIREMENT_IDS', `${prefix}.requirementIds`));
    structurallyValid = false;
  }
  if (!structurallyValid) return null;
  return {
    kind: source.kind.trim(),
    repository: source.repository.trim(),
    path: source.path.trim(),
    revisionSha: source.revisionSha,
    content: source.content,
    requirementIds: source.requirementIds ?? []
  };
}

function renderSection(source) {
  return `=== ${source.kind} ${source.repository}@${source.revisionSha}:${source.path} ===\n${source.content}\n`;
}

export function buildTaskContextPackage(input = {}) {
  const findings = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { passed: false, findings: [finding('INVALID_CONTEXT_INPUT', 'input')] };
  }

  for (const key of ['policySha', 'baseSha', 'headSha']) {
    if (!validSha(input[key])) findings.push(finding('INVALID_CONTEXT_SHA', key));
  }

  const acceptanceText = input.acceptance?.text;
  if (typeof acceptanceText !== 'string' || acceptanceText.length === 0) {
    findings.push(finding('CONTEXT_ACCEPTANCE_UNAVAILABLE', 'acceptance.text'));
  }

  const requirementIds = input.requirementIds ?? [];
  if (!uniqueStrings(requirementIds)) findings.push(finding('INVALID_CONTEXT_REQUIREMENT_IDS', 'requirementIds'));

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
      if (seenDependencies.has(dependency.repository)) findings.push(finding('CONTEXT_DEPENDENCY_DUPLICATE', prefix));
      seenDependencies.add(dependency.repository);
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
  if (!Array.isArray(input.sources) || input.sources.length === 0) {
    findings.push(finding('CONTEXT_SOURCE_UNAVAILABLE', 'sources'));
  } else {
    input.sources.forEach((source, index) => {
      const normalized = normalizeSource(source, index, findings);
      if (normalized) sources.push(normalized);
    });
  }

  if (validSha(input.policySha) && !sources.some(({ kind, revisionSha }) => kind === 'policy' && revisionSha === input.policySha)) {
    findings.push(finding('CONTEXT_POLICY_UNAVAILABLE', 'sources'));
  }

  for (const dependency of normalizedDependencies) {
    if (!sources.some(({ repository, revisionSha }) => repository === dependency.repository && revisionSha === dependency.revisionSha)) {
      findings.push(finding('CONTEXT_DEPENDENCY_UNAVAILABLE', `dependencies.${dependency.repository}`));
    }
  }

  if (uniqueStrings(requirementIds)) {
    const covered = new Set(sources.flatMap(({ requirementIds: ids }) => ids));
    for (const requirementId of requirementIds) {
      if (!covered.has(requirementId)) findings.push(finding('CONTEXT_REQUIREMENT_UNAVAILABLE', `requirementIds.${requirementId}`));
    }
  }

  const sections = [];
  if (typeof acceptanceText === 'string' && acceptanceText.length > 0) {
    sections.push(`=== acceptance ===\n${acceptanceText}\n`);
  }
  sections.push(...sources.map(renderSection));
  const assembledContext = sections.join('\n');
  const measured = checkAssembledExecutionContext([assembledContext]);
  findings.push(...measured.findings);

  const passed = findings.length === 0 && measured.actualBytes > 0;
  const manifest = {
    policySha: validSha(input.policySha) ? input.policySha : null,
    baseSha: validSha(input.baseSha) ? input.baseSha : null,
    headSha: validSha(input.headSha) ? input.headSha : null,
    acceptance: typeof acceptanceText === 'string'
      ? { sha256: sha256(acceptanceText), bytes: utf8Bytes(acceptanceText) }
      : null,
    requirementIds: uniqueStrings(requirementIds) ? [...requirementIds] : [],
    dependencies: normalizedDependencies,
    sources: sources.map((source) => ({
      kind: source.kind,
      repository: source.repository,
      path: source.path,
      revisionSha: source.revisionSha,
      sha256: sha256(source.content),
      bytes: utf8Bytes(source.content),
      requirementIds: [...source.requirementIds]
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

import { BUDGETS } from './budgets.mjs';

const CANONICAL_WORKFLOW_ROOT = 'https://github.com/syllik/ai-workflow/blob/HEAD';

function canonicalWorkflowFile(filePath) {
  return `${CANONICAL_WORKFLOW_ROOT}/${filePath}`;
}

function lf(text) {
  return String(text).replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function finalNewline(text) {
  return `${lf(text).replace(/\n+$/u, '')}\n`;
}

export function renderManagedBlock(name, body) {
  const start = `<!-- ai-workflow:${name}:start -->`;
  const end = `<!-- ai-workflow:${name}:end -->`;
  const normalized = finalNewline(body);
  const trimmed = normalized.trimEnd();
  if (trimmed.startsWith(`${start}\n`) && trimmed.endsWith(`\n${end}`) && markerState(trimmed, name).kind === 'valid') return normalized;
  const content = normalized.replace(/\n$/u, '');
  return `${start}\n${content}\n${end}\n`;
}

export function renderProjectIndex(manifest) {
  const rows = [...manifest.projects]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((project) => {
      const repositoryUrl = `https://github.com/${project.repository}`;
      const link = project.access === 'managed'
        ? `[${project.contextPath}](${repositoryUrl}/blob/HEAD/${project.contextPath})`
        : `[repository source of truth](${repositoryUrl})`;
      return `| ${project.repository} | ${project.group} | ${project.access} | ${project.status} | ${link} |`;
    });
  return finalNewline([
    '# Workspace project index',
    '',
    'Generated from `workspace.yaml`. Read the target repository context; legacy central project contexts are migration-only.',
    '',
    '| Repository | Group | Access | Status | GitHub source |',
    '| --- | --- | --- | --- | --- |',
    ...rows
  ].join('\n'));
}

export function renderProfileNavigation(manifest) {
  return finalNewline([
    '# Canonical AI workflow',
    '',
    `This profile AI entry covers the workspace rooted at \`${manifest.canonicalRoot}\`.`,
    '',
    'Reading route:',
    '',
    `1. Read the canonical workflow entry: ${canonicalWorkflowFile('FLOW.md')}.`,
    `2. Read one matching record from ${canonicalWorkflowFile('workspace.yaml')} and ${canonicalWorkflowFile('projects/index.md')}.`,
    `3. Read only the current role: ${canonicalWorkflowFile('global/architect.md')} or ${canonicalWorkflowFile('global/executor.md')}.`,
    '4. Read the target AGENTS.md and `.ai/context.md`.',
    '5. Read only relevant `.ai/decisions.md` and task files.',
    '',
    'GitHub is the only project registry. Do not auto-discover repositories or route into legacy central contexts.'
  ].join('\n'));
}

export function renderAgentsBlock(manifest) {
  const body = [
    'Canonical AI routing:',
    `1. Read the canonical workflow: ${canonicalWorkflowFile('FLOW.md')}.`,
    `2. Select one GitHub record from ${canonicalWorkflowFile('workspace.yaml')} / ${canonicalWorkflowFile('projects/index.md')}.`,
    `3. Read role rules from ${canonicalWorkflowFile('global/architect.md')} or ${canonicalWorkflowFile('global/executor.md')}.`,
    '4. Read target `AGENTS.md`, then target `.ai/context.md`.',
    '5. Read only relevant `.ai/decisions.md` and task files.',
    '',
    'Use GitHub records only. Legacy `projects/<project>/` contexts are migration-only; do not auto-discover repositories.',
    `Canonical root: ${manifest.canonicalRoot}`
  ].join('\n');
  const rendered = renderManagedBlock('agents-routing', body);
  if (Buffer.byteLength(rendered, 'utf8') > BUDGETS['managed AGENTS block']) throw new Error('Rendered AGENTS block exceeds budget');
  return rendered;
}

export function renderContextScaffold(project) {
  return finalNewline([
    '# Project',
    '',
    '## Repository',
    project.repository,
    '',
    '## Purpose',
    '',
    '## Current state',
    '',
    '## Stack',
    '',
    '## Architecture',
    '',
    '## Constraints',
    '',
    '## Conventions',
    '',
    '## Known issues',
    '',
    '## Current priorities',
    '',
    '## Canonical files in target repository'
  ].join('\n'));
}

export function renderDecisionsScaffold() {
  return finalNewline([
    '# Decisions',
    '',
    'Record durable decisions for this repository here.'
  ].join('\n'));
}

export function markerState(text, name) {
  const start = `<!-- ai-workflow:${name}:start -->`;
  const end = `<!-- ai-workflow:${name}:end -->`;
  const starts = [...String(text).matchAll(new RegExp(escapeRegExp(start), 'g'))].map((match) => match.index);
  const ends = [...String(text).matchAll(new RegExp(escapeRegExp(end), 'g'))].map((match) => match.index);
  if (starts.length > 1 || ends.length > 1) return { kind: 'duplicate', start, end };
  if (starts.length !== ends.length) return { kind: 'malformed', start, end };
  if (starts.length === 0) return { kind: 'missing', start, end };
  if (starts[0] > ends[0]) return { kind: 'malformed', start, end };
  return { kind: 'valid', start, end, startIndex: starts[0], endIndex: ends[0] };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replaceManagedBlock(text, name, renderedBlock) {
  const state = markerState(text, name);
  if (state.kind === 'duplicate' || state.kind === 'malformed') throw new Error(`Cannot replace ${state.kind} managed block`);
  const source = lf(text);
  if (state.kind === 'missing') return finalNewline(`${source.replace(/\n*$/u, '')}\n${renderedBlock}`);
  const endExclusive = state.endIndex + state.end.length;
  const prefix = source.slice(0, state.startIndex).replace(/\n*$/u, '');
  const suffix = source.slice(endExclusive).replace(/^\n+/u, '');
  const middle = renderedBlock.replace(/\n$/u, '');
  return finalNewline([prefix, middle, suffix].filter((part) => part.length > 0).join('\n'));
}

import { HARD_BUDGETS } from './manifest.mjs';

export const BUDGETS = HARD_BUDGETS;

export function utf8Bytes(text) {
  return Buffer.byteLength(String(text), 'utf8');
}

function resolveMaximum(filePath, budgets) {
  if (Object.hasOwn(budgets, filePath)) return budgets[filePath];
  if (/^(?:global\/|global\\)/.test(filePath)) return budgets['global role file'];
  if (filePath.endsWith('/.ai/context.md') || filePath === '.ai/context.md') return budgets['.ai/context.md'];
  if (filePath.endsWith('/decisions.md') || filePath === 'decisions.md') return budgets['one decision record'];
  if (filePath.endsWith('/prompt.md')) return budgets['prompt.md'];
  if (filePath.endsWith('/state.md')) return budgets['state.md'];
  if (filePath.endsWith('/result.md')) return budgets['result.md'];
  if (filePath.endsWith('/plan.md')) return budgets['human plan.md'];
  return undefined;
}

function exceeded(filePath, text, budgets) {
  const maxBytes = resolveMaximum(filePath, budgets);
  if (maxBytes === undefined) return null;
  const actualBytes = utf8Bytes(text);
  if (actualBytes <= maxBytes) return null;
  return {
    code: 'BUDGET_EXCEEDED',
    path: filePath,
    actualBytes,
    maxBytes,
    actual: actualBytes,
    maximum: maxBytes
  };
}

export function checkBudget(input, budgets = BUDGETS) {
  if (Array.isArray(input)) return checkBudgets(input, budgets);
  if (!input || typeof input !== 'object') return [{ code: 'INVALID_BUDGET_INPUT', path: 'budget' }];
  const path = input.path ?? input.name;
  if (typeof path !== 'string') return [{ code: 'INVALID_BUDGET_INPUT', path: 'budget.path' }];
  const finding = exceeded(path, input.text ?? input.content ?? '', budgets);
  return finding ? [finding] : [];
}

export function checkBudgets(entries, budgets = BUDGETS) {
  if (!Array.isArray(entries)) return checkBudget(entries, budgets);
  return entries
    .filter((entry) => entry && typeof entry.path === 'string')
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => exceeded(entry.path, entry.text ?? entry.content ?? '', budgets))
    .filter(Boolean);
}

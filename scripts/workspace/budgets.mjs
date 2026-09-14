import { ASSEMBLED_EXECUTION_CONTEXT_BUDGET_KEY, HARD_BUDGETS } from './manifest.mjs';

export const BUDGETS = HARD_BUDGETS;

export function utf8Bytes(text) {
  return Buffer.byteLength(String(text), 'utf8');
}

function resolveMaximum(filePath, budgets) {
  if (filePath === ASSEMBLED_EXECUTION_CONTEXT_BUDGET_KEY) return undefined;
  if (Object.hasOwn(budgets, filePath)) return budgets[filePath];
  if (filePath.endsWith('/AI.md')) return budgets['AI.md'];
  if (/^(?:global\/|global\\)/.test(filePath)) return budgets['global role file'];
  if (filePath.endsWith('/.ai/context.md') || filePath === '.ai/context.md') return budgets['.ai/context.md'];
  if (filePath.endsWith('/decisions.md') || filePath === 'decisions.md') return budgets['one decision record'];
  if (filePath.endsWith('/prompt.md')) return budgets['prompt.md'];
  if (filePath.endsWith('/state.md')) return budgets['state.md'];
  if (filePath.endsWith('/result.md')) return budgets['result.md'];
  if (filePath.endsWith('/plan.md')) return budgets['human plan.md'];
  return undefined;
}

function contextEntryText(entry) {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;

  const hasText = Object.hasOwn(entry, 'text');
  const hasContent = Object.hasOwn(entry, 'content');
  if (hasText === hasContent) return undefined;
  if ((hasText && typeof entry.text !== 'string') || (hasContent && typeof entry.content !== 'string')) return undefined;
  return hasText ? entry.text : entry.content;
}

export function checkAssembledExecutionContext(entries) {
  const findings = [];
  const actualBytes = [...entries].reduce((total, entry, index) => {
    const text = contextEntryText(entry);
    if (typeof text !== 'string') {
      findings.push({
        code: 'INVALID_ASSEMBLED_CONTEXT_ENTRY',
        index
      });
      return total;
    }
    return total + utf8Bytes(text);
  }, 0);
  const maxBytes = BUDGETS[ASSEMBLED_EXECUTION_CONTEXT_BUDGET_KEY];
  if (actualBytes > maxBytes) {
    findings.push({
      code: 'ASSEMBLED_CONTEXT_BUDGET_EXCEEDED',
      actualBytes,
      maxBytes
    });
  }
  return { actualBytes, maxBytes, findings };
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

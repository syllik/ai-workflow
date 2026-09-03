import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderAgentsBlock, renderManagedBlock, renderProfileNavigation, renderProjectIndex } from '../scripts/workspace/render.mjs';
import { fixtureManifest } from './helpers.mjs';

describe('renderers', () => {
  test('render deterministic project index routes only to target .ai/context.md', () => {
    const manifest = fixtureManifest();
    const first = renderProjectIndex(manifest);
    const second = renderProjectIndex(manifest);
    assert.equal(first, second);
    assert.equal(first.endsWith('\n'), true);
    assert.equal(first.includes('\r'), false);
    assert.equal(first.includes('projects/'), false);
    for (const project of manifest.projects) {
      assert.equal(first.includes(`${project.localPath}/.ai/context.md`), true);
      assert.equal(first.includes(project.access), true);
      assert.equal(first.includes(project.status), true);
    }
  });

  test('render navigation contains the canonical reading route', () => {
    const output = renderProfileNavigation(fixtureManifest());
    assert.match(output, /profile AI entry/);
    assert.match(output, /FLOW\.md/);
    assert.match(output, /workspace\.yaml/);
    assert.match(output, /global\/architect\.md/);
    assert.match(output, /target AGENTS\.md/);
    assert.equal(output.endsWith('\n'), true);
    assert.equal(output.includes('\r'), false);
  });

  test('render managed blocks use exact markers and are idempotent', () => {
    const block = renderManagedBlock('routing', 'line one\nline two\r\n');
    assert.equal(block, '<!-- ai-workflow:routing:start -->\nline one\nline two\n<!-- ai-workflow:routing:end -->\n');
    assert.equal(renderManagedBlock('routing', block), block);
  });

  test('render agents block stays within its hard budget', () => {
    const output = renderAgentsBlock(fixtureManifest());
    assert.equal(output.startsWith('<!-- ai-workflow:agents-routing:start -->\n'), true);
    assert.equal(output.endsWith('<!-- ai-workflow:agents-routing:end -->\n'), true);
    assert.ok(Buffer.byteLength(output, 'utf8') <= 1024);
  });
});

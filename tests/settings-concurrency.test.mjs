import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeOnto } from '../src/ui/settings/merge-settings.ts';
import { toDraft } from '../src/ui/settings/types.ts';

const snapshot = () => ({
  revision: 'opening-revision', endpoints: [],
  models: [{ id: 'model', endpointId: 'endpoint', modelId: 'test', label: 'Original',
    contextWindow: 64000, reasoning: { kind: 'none' }, overrides: [], metadataSource: 'catalog' }],
  defaultModelId: 'model', features: [], prompts: [], runtime: {},
  sync: { hasPassword: false },
});

test('model drawer merge preserves a remote capacity change and both manual override flags', () => {
  const base = snapshot(), latest = structuredClone(base), draft = structuredClone(toDraft(base));
  latest.revision = 'remote-revision';
  Object.assign(latest.models[0], { contextWindow: 128000, overrides: ['contextWindow'], metadataSource: 'manual' });
  Object.assign(draft.models[0], { label: 'Local name', overrides: ['label'], metadataSource: 'manual' });
  const { merged, conflicts } = mergeOnto(latest, base, draft);
  assert.deepEqual(conflicts, []);
  assert.equal(merged.models[0].label, 'Local name');
  assert.equal(merged.models[0].contextWindow, 128000);
  assert.deepEqual(new Set(merged.models[0].overrides), new Set(['contextWindow', 'label']));
  assert.equal(base.models[0].contextWindow, 64000);
  assert.equal(draft.models[0].contextWindow, 64000);
});

test('same-field edits report a conflict without dropping unrelated remote changes', () => {
  const base = snapshot(), latest = structuredClone(base), draft = structuredClone(toDraft(base));
  Object.assign(latest.models[0], { label: 'Remote name', contextWindow: 128000 });
  draft.models[0].label = 'Local name';
  const { merged, conflicts } = mergeOnto(latest, base, draft);
  assert.deepEqual(conflicts, ['models.model.label']);
  assert.equal(merged.models[0].label, 'Local name');
  assert.equal(merged.models[0].contextWindow, 128000);
});

test('remote model deletion conflicts with a local edit instead of silently restoring it', () => {
  const base = snapshot(), latest = structuredClone(base), draft = structuredClone(toDraft(base));
  latest.models = []; latest.defaultModelId = null;
  draft.models[0].label = 'Local name';
  assert.deepEqual(mergeOnto(latest, base, draft).conflicts, ['models.model']);
  // An untouched drawer must follow the deletion without a conflict.
  assert.deepEqual(mergeOnto(latest, base, toDraft(base)).merged.models, []);
});

test('restoring catalog flags merges with another window adding a different manual override', () => {
  const base = snapshot(); base.models[0].overrides = ['label'];
  const latest = structuredClone(base), draft = structuredClone(toDraft(base));
  latest.models[0].overrides = [];
  draft.models[0].overrides = ['label', 'contextWindow'];
  const { merged, conflicts } = mergeOnto(latest, base, draft);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(merged.models[0].overrides, ['contextWindow']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPasted, endpointUrl, modelConfigurationStatus, resolveConfiguredModel, supportsModelOperation } from '../src/ai/model-configuration.ts';
import { deriveSettingsStatus } from '../src/runtime/settings-status.ts';

const settings = protocol => ({
  endpoints: [{ id: 'endpoint', protocol, baseUrl: 'https://model.example/v1', hasKey: false }],
  models: [{ id: 'model', endpointId: 'endpoint', modelId: 'example', label: 'My model' }],
  defaultModelId: 'model', features: [], sync: { enabled: false },
});

test('model protocol override is shared by routing, status and feature checks',()=>{
  const view=settings('openai-chat');view.models[0].protocolOverride='anthropic';
  assert.equal(resolveConfiguredModel(view).endpoint.protocol,'anthropic');
  assert.equal(modelConfigurationStatus(view).state,'configured');
  assert.equal(modelConfigurationStatus(view,'translate').state,'unavailable');
  assert.equal(view.endpoints[0].protocol,'openai-chat');
});

for (const protocol of ['openai-chat', 'openai-responses', 'anthropic', 'gemini']) {
  test(`${protocol}: configuration status agrees with generation routing`, () => {
    const view = settings(protocol);
    assert.equal(resolveConfiguredModel(view, undefined, 'discuss').model.id, 'model');
    assert.deepEqual(modelConfigurationStatus(view), { state: 'configured', label: 'My model' });
    assert.equal(deriveSettingsStatus(view, 'ready').modelAvailability, 'configured');
  });
}

test('translation limits are feature-specific, not a global model failure', () => {
  for (const protocol of ['anthropic', 'gemini']) {
    const view = settings(protocol);
    assert.equal(modelConfigurationStatus(view).state, 'configured');
    assert.match(modelConfigurationStatus(view, 'translate').message, /不支持翻译/);
    assert.throws(() => resolveConfiguredModel(view, undefined, 'translate'), /不支持翻译/);
  }
  for (const protocol of ['openai-chat', 'openai-responses'])
    assert.equal(modelConfigurationStatus(settings(protocol), 'translate').state, 'configured');
});

test('default, feature, explicit choice and fallback use the same resolver', () => {
  const view = settings('openai-chat');
  view.models.push({ ...view.models[0], id: 'translation', label: 'Translation' });
  view.features.push({ feature: 'translate', enabled: true, modelId: 'translation' });
  assert.equal(modelConfigurationStatus(view).label, 'My model');
  assert.equal(modelConfigurationStatus(view, 'translate').label, 'Translation');
  assert.equal(resolveConfiguredModel(view, 'model', 'translate').model.id, 'model');
  view.defaultModelId = null;
  assert.equal(modelConfigurationStatus(view).label, 'Translation');
  view.features[0].enabled = false;
  assert.equal(modelConfigurationStatus(view).label, 'My model');
  assert.throws(() => resolveConfiguredModel(view, 'model', 'translate'), /关闭/);
});

test('invalid endpoint, missing model and unknown protocols fail before dispatch', () => {
  for (const protocol of ['future-unsupported', '__proto__', 'constructor']) {
    assert.equal(supportsModelOperation(protocol, 'generation'), false);
    assert.equal(modelConfigurationStatus(settings(protocol)).state, 'unavailable');
  }
  const view = settings('openai-chat');
  view.endpoints[0].baseUrl = 'http://remote.example';
  assert.equal(modelConfigurationStatus(view).state, 'unavailable');
  assert.throws(() => resolveConfiguredModel(view), /HTTPS/);
  view.endpoints[0].baseUrl = 'http://localhost:8080/v1';
  assert.equal(modelConfigurationStatus(view).state, 'configured');
  view.defaultModelId = 'removed';
  assert.equal(modelConfigurationStatus(view).state, 'unavailable');
});

test('pasted native request paths normalize without changing destination or accepting credentials',()=>{
 assert.equal(endpointUrl('https://api.anthropic.com/v1/messages'),'https://api.anthropic.com/v1');
 assert.equal(endpointUrl('https://generativelanguage.googleapis.com/v1beta/models/gemini:streamGenerateContent'),'https://generativelanguage.googleapis.com/v1beta');
 assert.throws(()=>endpointUrl('https://key:secret@example.com/v1'));
});

test('invisible characters copied with an address or key are dropped',()=>{
 // A trailing zero-width space used to turn /v3/models into /v3%E2%80%8B/models (HTTP 404).
 assert.equal(endpointUrl('https://ark.cn-beijing.volces.com/api/coding/v3\u200B'),'https://ark.cn-beijing.volces.com/api/coding/v3');
 assert.equal(endpointUrl('\uFEFF https://api.example.com/\u2060v1\u200D/ '),'https://api.example.com/v1');
 assert.equal(cleanPasted(' \u200Bsk-ab\u00ADc\u200C\n'),'sk-abc');
});

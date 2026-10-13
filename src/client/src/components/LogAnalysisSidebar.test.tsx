import { describe, expect, test } from '@jest/globals';
import { preferredSelection, requiresCloudConsent, usableModels } from './logAnalysisModels';
import { AnalysisProvider } from './logAnalysisTypes';

const local: AnalysisProvider = { id: 'ollama', name: 'Ollama', available: true, kind: 'local', models: [
  { name: 'local-1', local: true, kind: 'local', available: true },
  { name: 'cloud-1', local: false, kind: 'cloud', available: true },
  { name: 'unverified', local: false },
  { name: 'unavailable', local: false, kind: 'unavailable', available: false },
  { name: 'unavailable-local', local: true, kind: 'local', available: false },
] };
const cloud: AnalysisProvider = { id: 'codex', name: 'Codex', available: true, kind: 'cloud' };
const initial = { providerId: '', model: '' };

describe('model availability and explicit cloud consent', () => {
  test('handles undefined providers, missing models, and empty model lists', () => {
    expect(usableModels()).toEqual([]);
    expect(usableModels(cloud)).toEqual([]);
    expect(usableModels({ ...local, models: [] })).toEqual([]);
    expect(requiresCloudConsent(undefined, '')).toBe(false);
    expect(preferredSelection([], initial)).toEqual(initial);
  });

  test('offers only verified local or cloud models', () => {
    expect(usableModels(local).map(model => model.name)).toEqual(['local-1', 'cloud-1']);
    expect(usableModels({ ...local, models: [{ name: 'legacy-local', local: true }] })).toEqual([{ name: 'legacy-local', local: true }]);
    expect(requiresCloudConsent(local, 'local-1')).toBe(false);
    expect(requiresCloudConsent(local, 'cloud-1')).toBe(true);
    expect(requiresCloudConsent(local, 'unverified')).toBe(false);
    expect(requiresCloudConsent(cloud, '')).toBe(true);
  });

  test('prefers local Ollama, retains selected cloud model, and falls back when model disappears', () => {
    expect(preferredSelection([cloud, local], initial)).toEqual({ providerId: 'ollama', model: 'local-1' });
    expect(preferredSelection([cloud, local], { providerId: 'ollama', model: 'cloud-1' })).toEqual({ providerId: 'ollama', model: 'cloud-1' });
    expect(preferredSelection([cloud, local], { providerId: 'ollama', model: 'removed' })).toEqual({ providerId: 'ollama', model: 'local-1' });
  });

  test('preserves cloud CLI overrides and clears overrides when providers change', () => {
    expect(preferredSelection([cloud, local], { providerId: 'codex', model: 'selected-cloud-model' })).toEqual({ providerId: 'codex', model: 'selected-cloud-model' });
    expect(preferredSelection([cloud], { providerId: 'claude', model: 'other-provider-model' })).toEqual({ providerId: 'codex', model: '' });
  });

  test('allows cloud-only Ollama while skipping unavailable providers and unknown models', () => {
    const cloudOnly: AnalysisProvider = { ...local, models: [{ name: 'cloud-1', local: false, kind: 'cloud', available: true }] };
    expect(preferredSelection([cloudOnly], initial)).toEqual({ providerId: 'ollama', model: 'cloud-1' });
    expect(preferredSelection([{ ...local, available: false }, cloud], initial)).toEqual({ providerId: 'codex', model: '' });
    expect(preferredSelection([{ ...local, models: [] }, cloud], initial)).toEqual({ providerId: 'codex', model: '' });
  });

  test('handles a full bounded model catalog and selection of its final model', () => {
    const CATALOG_SIZE = 256;
    const models = Array.from({ length: CATALOG_SIZE }, (_, index) => ({ name: `model-${index}`, local: true }));
    const provider = { ...local, models };
    expect(usableModels(provider)).toHaveLength(CATALOG_SIZE);
    expect(preferredSelection([provider], { providerId: 'ollama', model: `model-${CATALOG_SIZE - 1}` })).toEqual({ providerId: 'ollama', model: `model-${CATALOG_SIZE - 1}` });
  });
});

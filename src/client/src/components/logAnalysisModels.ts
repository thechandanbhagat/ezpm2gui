import { AnalysisModel, AnalysisProvider } from './logAnalysisTypes';

export const usableModels = (provider?: AnalysisProvider): AnalysisModel[] =>
  provider?.models?.filter(model => model.available !== false && model.kind !== 'unavailable'
    && (model.local || model.kind === 'cloud')) || [];

export const requiresCloudConsent = (provider: AnalysisProvider | undefined, model: string): boolean =>
  provider?.kind === 'cloud' || usableModels(provider).some(item => item.name === model && item.kind === 'cloud');

export const preferredSelection = (providers: AnalysisProvider[], previous: { providerId: string; model: string }) => {
  const usable = (provider: AnalysisProvider) => provider.available
    && (provider.id !== 'ollama' || usableModels(provider).length > 0);
  const provider = providers.find(item => item.id === previous.providerId && usable(item))
    || providers.find(item => item.id === 'ollama' && usable(item) && usableModels(item).some(model => model.local))
    || providers.find(usable) || providers[0];
  const models = usableModels(provider);
  return {
    providerId: provider?.id || '',
    model: provider?.id === 'ollama'
      ? models.find(item => item.name === previous.model)?.name || models.find(item => item.local)?.name || models[0]?.name || ''
      : provider?.id === previous.providerId ? previous.model : '',
  };
};

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { LogAnalysisSidebar } from './LogAnalysisSidebar';
import { preferredSelection, requiresCloudConsent, usableModels } from './logAnalysisModels';
import { AnalysisConversation, AnalysisConversationSummary, AnalysisProvider, AnalysisTarget, SnapshotResponse } from './logAnalysisTypes';

const STORAGE_KEY = 'ezpm2gui.logAnalysis.active';
const POLL_INTERVAL_MS = 1500;
const HISTORY_PAGE_SIZE = 20;
const DEFAULT_QUESTION = 'Analyze these application logs and identify suspected issues with supporting log evidence.';
const UUID_BYTES = 16;
const UUID_VERSION_OFFSET = 6;
const UUID_VARIANT_OFFSET = 8;
const UUID_LOW_NIBBLE_MASK = 15;
const UUID_VERSION_FOUR = 64;
const UUID_VARIANT_MASK = 63;
const UUID_RFC_VARIANT = 128;

const createRequestId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(UUID_BYTES));
  bytes[UUID_VERSION_OFFSET] = (bytes[UUID_VERSION_OFFSET] & UUID_LOW_NIBBLE_MASK) | UUID_VERSION_FOUR;
  bytes[UUID_VARIANT_OFFSET] = (bytes[UUID_VARIANT_OFFSET] & UUID_VARIANT_MASK) | UUID_RFC_VARIANT;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

interface AnalysisSession {
  visible: boolean;
  target: AnalysisTarget | null;
  conversation: AnalysisConversation | null;
}

interface AnalysisContextValue extends AnalysisSession {
  providers: AnalysisProvider[];
  selection: { providerId: string; model: string };
  snapshotInfo: SnapshotResponse | null;
  history: AnalysisConversationSummary[];
  nextCursor?: string;
  question: string;
  allowCloud: boolean;
  loadingProviders: boolean;
  loadingSnapshot: boolean;
  loadingHistory: boolean;
  busy: boolean;
  running: boolean;
  ready: boolean;
  providerError: string;
  snapshotError: string;
  historyError: string;
  analysisError: string;
  openAnalysis: (target: AnalysisTarget) => void;
  hideAnalysis: () => void;
  selectProvider: (id: string) => void;
  selectModel: (model: string) => void;
  setQuestion: (question: string) => void;
  setAllowCloud: (allowed: boolean) => void;
  refreshProviders: () => Promise<void>;
  newAnalysis: () => Promise<void>;
  refreshHistory: (more?: boolean) => Promise<void>;
  reopenConversation: (id: string) => Promise<void>;
  analyze: () => Promise<void>;
  cancelAnalysis: () => Promise<void>;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);
const emptySession: AnalysisSession = { visible: false, target: null, conversation: null };
const sameTarget = (left: AnalysisTarget | null, right: AnalysisTarget) =>
  left?.processId === right.processId && left.connectionId === right.connectionId;
const failureMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error.response;
    if (typeof response === 'object' && response !== null && 'data' in response) {
      const data = response.data;
      if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') return data.error;
    }
  }
  return error instanceof Error && !axios.isAxiosError(error) ? error.message : fallback;
};
const validateConversation = (conversation: AnalysisConversation): AnalysisConversation => {
  if (!conversation || typeof conversation.id !== 'string' || !Number.isSafeInteger(conversation.processId)
    || !conversation.snapshot || !Array.isArray(conversation.snapshot.logs) || !Array.isArray(conversation.messages)
    || !conversation.messages.every(message => typeof message.id === 'string' && typeof message.question === 'string'
      && ['running', 'completed', 'failed', 'cancelled', 'interrupted'].includes(message.status)
      && (!message.result || typeof message.result.analysis === 'string'))) throw new Error('Invalid analysis conversation response.');
  return conversation;
};

export const useLogAnalysis = (): AnalysisContextValue => {
  const context = useContext(AnalysisContext);
  if (!context) throw new Error('Log analysis must be used inside LogAnalysisProvider.');
  return context;
};

export const LogAnalysisProvider: React.FC<{ children: React.ReactNode; enabled?: boolean }> = ({ children, enabled = true }) => {
  const { t } = useTranslation();
  const [session, setSession] = useState<AnalysisSession>(emptySession);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [providers, setProviders] = useState<AnalysisProvider[]>([]);
  const [selection, setSelection] = useState({ providerId: '', model: '' });
  const [snapshotInfo, setSnapshotInfo] = useState<SnapshotResponse | null>(null);
  const [history, setHistory] = useState<AnalysisConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [question, setQuestion] = useState('');
  const [allowCloud, setAllowCloud] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [providerError, setProviderError] = useState('');
  const [snapshotError, setSnapshotError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const requests = useRef(new Set<AbortController>());
  const scope = useRef(0);
  const [scopeVersion, setScopeVersion] = useState(0);
  const access = useRef(enabled);
  access.current = enabled;
  const snapshotRequest = useRef<AbortController | null>(null);
  const providersLoaded = useRef(false);
  const providerRequest = useRef<{ controller: AbortController; refresh: boolean; promise: Promise<void> } | null>(null);
  const historyRequest = useRef<AbortController | null>(null);
  const conversationRequest = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const pendingMessage = useRef<{ conversationId: string; fingerprint: string; clientRequestId: string } | null>(null);

  const changeScope = useCallback(() => {
    const version = ++scope.current;
    setScopeVersion(version);
    return version;
  }, []);

  const request = useCallback(() => {
    const controller = new AbortController();
    requests.current.add(controller);
    return controller;
  }, []);
  const current = useCallback((version: number, controller: AbortController) => access.current && scope.current === version && !controller.signal.aborted, []);
  const remember = useCallback((value: AnalysisSession) => {
    try {
      if (value.conversation) localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: value.conversation.id, visible: value.visible }));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (error) { setHistoryError(failureMessage(error, t('logAnalysis.preferenceError'))); }
  }, [t]);
  const acceptConversation = useCallback((conversation: AnalysisConversation, visible?: boolean) => {
    const received = validateConversation(conversation);
    const previous = sessionRef.current.conversation;
    const previousMessages = previous?.id === received.id ? previous.messages : [];
    const messages = received.messages.map(message => {
      const saved = previousMessages.find(item => item.id === message.id);
      return saved && saved.status !== 'running' ? saved : message;
    });
    const detail = { ...received, messages: [...messages, ...previousMessages.filter(message => !messages.some(item => item.id === message.id))] };
    const value: AnalysisSession = {
      target: { processId: detail.processId, processName: detail.processName, connectionId: detail.connectionId },
      conversation: detail, visible: visible ?? sessionRef.current.visible,
    };
    sessionRef.current = value;
    setSession(value);
    setSnapshotInfo({ snapshot: detail.snapshot, redactionCount: detail.redactionCount || 0,
      truncated: detail.truncated || false, warnings: detail.warnings });
    setHistory(previous => [detail, ...previous.filter(item => item.id !== detail.id)]);
    remember(value);
  }, [remember]);

  const loadProviders = useCallback(async (refresh = false) => {
    if (!access.current) return;
    const pending = providerRequest.current;
    if (pending && !pending.controller.signal.aborted && (!refresh || pending.refresh)) return pending.promise;
    if (!refresh && providersLoaded.current) return;
    pending?.controller.abort();
    const controller = request();
    setLoadingProviders(true);
    setProviderError('');
    const active = () => access.current && !controller.signal.aborted && providerRequest.current?.controller === controller;
    const promise = (async () => {
      try {
        const response = refresh
          ? await axios.post<{ providers: AnalysisProvider[] }>('/api/log-analysis/providers/refresh', {}, { signal: controller.signal })
          : await axios.get<{ providers: AnalysisProvider[] }>('/api/log-analysis/providers', { signal: controller.signal });
        if (!active()) return;
        if (!Array.isArray(response.data.providers) || !response.data.providers.every(provider => provider
          && typeof provider.id === 'string' && typeof provider.name === 'string' && typeof provider.available === 'boolean'
          && ['local', 'cloud'].includes(provider.kind) && (!provider.models || (Array.isArray(provider.models)
            && provider.models.every(model => model && typeof model.name === 'string' && typeof model.local === 'boolean'))))) throw new Error('Invalid analysis provider response.');
        providersLoaded.current = true;
        setProviders(response.data.providers);
        setSelection(previous => preferredSelection(response.data.providers, previous));
      } catch (error) {
        if (active()) setProviderError(failureMessage(error, t('logAnalysis.providerError')));
      } finally {
        requests.current.delete(controller);
        if (active()) {
          providerRequest.current = null;
          setLoadingProviders(false);
        }
      }
    })();
    providerRequest.current = { controller, refresh, promise };
    await promise;
  }, [request, t]);
  const refreshProviders = useCallback(() => loadProviders(true), [loadProviders]);

  const loadSnapshot = useCallback(async (target: AnalysisTarget, version: number) => {
    snapshotRequest.current?.abort();
    const controller = request();
    snapshotRequest.current = controller;
    setLoadingSnapshot(true);
    setSnapshotError('');
    try {
      const response = await axios.post<SnapshotResponse>('/api/log-analysis/snapshot', {
        processId: target.processId, ...(target.connectionId ? { connectionId: target.connectionId } : {}),
      }, { signal: controller.signal });
      if (!current(version, controller)) return;
      if (!response.data.snapshot || !Array.isArray(response.data.snapshot.logs)
        || !response.data.snapshot.logs.every(line => line && ['stdout', 'stderr'].includes(line.stream) && typeof line.message === 'string')) throw new Error('Invalid analysis snapshot response.');
      setSnapshotInfo(response.data);
    } catch (error) {
      if (current(version, controller)) setSnapshotError(failureMessage(error, t('logAnalysis.snapshotError')));
    } finally {
      requests.current.delete(controller);
      if (current(version, controller)) setLoadingSnapshot(false);
    }
  }, [current, request, t]);

  const loadHistory = useCallback(async (target: AnalysisTarget, version: number, cursor?: string) => {
    historyRequest.current?.abort();
    const controller = request();
    historyRequest.current = controller;
    setLoadingHistory(true);
    setHistoryError('');
    try {
      const response = await axios.get<{ conversations: AnalysisConversationSummary[]; nextCursor?: string }>('/api/log-analysis/conversations', {
        params: { processId: target.processId, ...(target.connectionId ? { connectionId: target.connectionId } : {}), limit: HISTORY_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
        signal: controller.signal,
      });
      if (!current(version, controller)) return;
      if (!Array.isArray(response.data.conversations)) throw new Error('Invalid analysis history response.');
      setHistory(previous => cursor ? [...previous, ...response.data.conversations.filter(item => !previous.some(saved => saved.id === item.id))] : response.data.conversations);
      setNextCursor(response.data.nextCursor);
    } catch (error) {
      if (current(version, controller)) setHistoryError(failureMessage(error, t('logAnalysis.historyError')));
    } finally {
      requests.current.delete(controller);
      if (current(version, controller)) setLoadingHistory(false);
    }
  }, [current, request, t]);

  const reopenConversation = useCallback(async (id: string, restoredVisible?: boolean) => {
    if (!access.current) return;
    conversationRequest.current?.abort();
    const controller = request();
    conversationRequest.current = controller;
    snapshotRequest.current?.abort();
    setLoadingSnapshot(false);
    setSnapshotError('');
    const version = changeScope();
    setBusy(true);
    setAnalysisError('');
    try {
      const response = await axios.get<{ conversation: AnalysisConversation }>(`/api/log-analysis/conversations/${encodeURIComponent(id)}`, { signal: controller.signal });
      if (!current(version, controller)) return;
      const conversation = validateConversation(response.data.conversation);
      if (restoredVisible === undefined && sessionRef.current.target && !sameTarget(sessionRef.current.target, conversation)) throw new Error('This conversation belongs to another process or connection.');
      acceptConversation(conversation, restoredVisible);
      setQuestion('');
      setAllowCloud(false);
      const latest = conversation.messages[conversation.messages.length - 1];
      if (latest) setSelection({ providerId: latest.provider, model: latest.model || '' });
      void loadHistory(conversation, version);
    } catch (error) {
      if (current(version, controller)) setAnalysisError(failureMessage(error, t('logAnalysis.historyError')));
    } finally {
      requests.current.delete(controller);
      if (current(version, controller)) setBusy(false);
    }
  }, [acceptConversation, changeScope, current, loadHistory, request, t]);

  const newAnalysis = useCallback(async () => {
    const target = sessionRef.current.target;
    if (!access.current || !target || submitting.current) return;
    const version = changeScope();
    conversationRequest.current?.abort();
    const value = { ...sessionRef.current, conversation: null };
    sessionRef.current = value;
    setSession(value);
    remember(value);
    setSnapshotInfo(null);
    setQuestion('');
    setAllowCloud(false);
    setAnalysisError('');
    setBusy(false);
    pendingMessage.current = null;
    await Promise.all([loadSnapshot(target, version), loadHistory(target, version)]);
  }, [changeScope, loadHistory, loadSnapshot, remember]);

  const openAnalysis = (target: AnalysisTarget) => {
    if (!enabled || !Number.isSafeInteger(target.processId) || target.processId < 0) return;
    if (sameTarget(sessionRef.current.target, target)) {
      const value = { ...sessionRef.current, visible: true };
      sessionRef.current = value;
      setSession(value);
      remember(value);
      return;
    }
    const version = changeScope();
    conversationRequest.current?.abort();
    const value = { visible: true, target, conversation: null };
    sessionRef.current = value;
    setSession(value);
    setSnapshotInfo(null);
    setHistory([]);
    setNextCursor(undefined);
    setQuestion('');
    setAllowCloud(false);
    setAnalysisError('');
    setBusy(false);
    pendingMessage.current = null;
    remember(value);
    void loadSnapshot(target, version);
    void loadHistory(target, version);
    void loadProviders();
  };
  const hideAnalysis = () => {
    const value = { ...sessionRef.current, visible: false };
    sessionRef.current = value;
    setSession(value);
    remember(value);
  };

  const lifecycleActions = useRef({ reopenConversation, loadProviders, changeScope, t });
  lifecycleActions.current = { reopenConversation, loadProviders, changeScope, t };
  useEffect(() => {
    const activeRequests = requests.current;
    const actions = lifecycleActions.current;
    if (enabled) {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved && typeof saved === 'object' && 'id' in saved && typeof saved.id === 'string') {
          void actions.reopenConversation(saved.id, 'visible' in saved && saved.visible === true);
          void actions.loadProviders();
        }
      } catch (error) { setHistoryError(failureMessage(error, actions.t('logAnalysis.preferenceError'))); }
    } else {
      actions.changeScope();
      requests.current.forEach(controller => controller.abort());
      providerRequest.current = null;
      providersLoaded.current = false;
      submitting.current = false;
      pendingMessage.current = null;
      sessionRef.current = emptySession;
      setSession(emptySession);
      setProviders([]);
      setSelection({ providerId: '', model: '' });
      setSnapshotInfo(null);
      setHistory([]);
      setNextCursor(undefined);
      setQuestion('');
      setAllowCloud(false);
      setBusy(false);
      setLoadingProviders(false);
      setLoadingSnapshot(false);
      setLoadingHistory(false);
      setProviderError('');
      setSnapshotError('');
      setHistoryError('');
      setAnalysisError('');
    }
    return () => { activeRequests.forEach(controller => controller.abort()); };
  }, [enabled]);

  const running = session.conversation?.messages.some(message => message.status === 'running') || false;
  useEffect(() => {
    const id = session.conversation?.id;
    if (!enabled || !id || !running) return;
    const version = scope.current;
    let polling = false;
    const controller = request();
    const activeRequests = requests.current;
    const poll = async () => {
      if (polling || !current(version, controller)) return;
      polling = true;
      try {
        const response = await axios.get<{ conversation: AnalysisConversation }>(`/api/log-analysis/conversations/${encodeURIComponent(id)}`, { signal: controller.signal });
        if (current(version, controller)) {
          acceptConversation(response.data.conversation);
          setAnalysisError('');
        }
      } catch (error) {
        if (current(version, controller)) setAnalysisError(failureMessage(error, t('logAnalysis.pollError')));
      } finally { polling = false; }
    };
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => { clearInterval(timer); controller.abort(); activeRequests.delete(controller); };
  }, [session.conversation?.id, scopeVersion, enabled, running, request, acceptConversation, current, t]);

  useEffect(() => { setAllowCloud(false); }, [selection.providerId, selection.model]);
  const provider = providers.find(item => item.id === selection.providerId);
  const cloud = requiresCloudConsent(provider, selection.model);
  const validModel = provider?.id !== 'ollama' || usableModels(provider).some(model => model.name === selection.model);
  const ready = Boolean(enabled && provider?.available && snapshotInfo?.snapshot.logs.length && validModel
    && (!cloud || allowCloud) && !loadingProviders && !loadingSnapshot && !busy && !running
    && (!session.conversation?.messages.length || question.trim()));

  const analyze = async () => {
    if (!ready || !snapshotInfo || !session.target || submitting.current) return;
    submitting.current = true;
    const version = scope.current;
    const controller = request();
    setBusy(true);
    setAnalysisError('');
    let conversationId = sessionRef.current.conversation?.id;
    let submittedRequestId: string | undefined;
    try {
      let conversation = sessionRef.current.conversation;
      if (!conversation) {
        const response = await axios.post<{ conversation: AnalysisConversation }>('/api/log-analysis/conversations', {
          ...snapshotInfo, ...(session.target.connectionId ? { connectionId: session.target.connectionId } : {}),
        }, { signal: controller.signal });
        if (!current(version, controller)) return;
        conversation = validateConversation(response.data.conversation);
        acceptConversation(conversation);
      }
      conversationId = conversation.id;
      const payload = {
        provider: selection.providerId, ...(selection.model.trim() ? { model: selection.model.trim() } : {}),
        question: question.trim() || DEFAULT_QUESTION, allowCloud: cloud && allowCloud,
      };
      const fingerprint = JSON.stringify({ conversationId, ...payload });
      const previous = pendingMessage.current;
      if (previous && previous.conversationId === conversationId && previous.fingerprint !== fingerprint) {
        const latest = await axios.get<{ conversation: AnalysisConversation }>(`/api/log-analysis/conversations/${encodeURIComponent(conversationId)}`, { signal: controller.signal });
        if (!current(version, controller)) return;
        const detail = validateConversation(latest.data.conversation);
        acceptConversation(detail);
        if (detail.messages.some(message => message.status === 'running')) {
          setAnalysisError(t('logAnalysis.previousRequestRunning'));
          return;
        }
      }
      const clientRequestId = previous?.fingerprint === fingerprint ? previous.clientRequestId : createRequestId();
      pendingMessage.current = { conversationId, fingerprint, clientRequestId };
      submittedRequestId = clientRequestId;
      const response = await axios.post<{ conversation: AnalysisConversation }>(`/api/log-analysis/conversations/${encodeURIComponent(conversation.id)}/messages`, {
        ...payload, clientRequestId,
      }, { signal: controller.signal });
      if (current(version, controller)) {
        acceptConversation(response.data.conversation);
        setQuestion('');
        pendingMessage.current = null;
      }
    } catch (error) {
      if (!current(version, controller)) return;
      let reconciled = false;
      if (conversationId && submittedRequestId) {
        try {
          const response = await axios.get<{ conversation: AnalysisConversation }>(`/api/log-analysis/conversations/${encodeURIComponent(conversationId)}`, { signal: controller.signal });
          if (!current(version, controller)) return;
          const detail = validateConversation(response.data.conversation);
          acceptConversation(detail);
          reconciled = detail.messages.some(message => message.clientRequestId === submittedRequestId);
          if (reconciled) {
            setQuestion('');
            pendingMessage.current = null;
          }
        } catch (recoveryError) {
          if (current(version, controller)) setAnalysisError(`${failureMessage(error, t('logAnalysis.analysisError'))} ${failureMessage(recoveryError, t('logAnalysis.uncertainRequest'))}`);
          return;
        }
      }
      if (!reconciled && current(version, controller)) setAnalysisError(failureMessage(error, t('logAnalysis.analysisError')));
    } finally {
      requests.current.delete(controller);
      submitting.current = false;
      if (current(version, controller)) setBusy(false);
    }
  };
  const cancelAnalysis = async () => {
    const conversation = sessionRef.current.conversation;
    const message = conversation?.messages.find(item => item.status === 'running');
    if (!conversation || !message || busy || !enabled) return;
    const version = scope.current;
    const controller = request();
    setBusy(true);
    setAnalysisError('');
    try {
      const response = await axios.post<{ conversation: AnalysisConversation }>(`/api/log-analysis/conversations/${encodeURIComponent(conversation.id)}/messages/${encodeURIComponent(message.id)}/cancel`, {}, { signal: controller.signal });
      if (current(version, controller)) acceptConversation(response.data.conversation);
    } catch (error) {
      if (current(version, controller)) setAnalysisError(failureMessage(error, t('logAnalysis.cancelError')));
    } finally {
      requests.current.delete(controller);
      if (current(version, controller)) setBusy(false);
    }
  };

  const value: AnalysisContextValue = { ...session, providers, selection, snapshotInfo, history, nextCursor, question, allowCloud,
    loadingProviders, loadingSnapshot, loadingHistory, busy, running, ready, providerError, snapshotError, historyError, analysisError,
    openAnalysis, hideAnalysis, setQuestion, setAllowCloud, refreshProviders, newAnalysis, reopenConversation, analyze, cancelAnalysis,
    refreshHistory: async (more = false) => { if (session.target) await loadHistory(session.target, scope.current, more ? nextCursor : undefined); },
    selectProvider: id => { const selected = providers.find(item => item.id === id); setAllowCloud(false); setSelection(preferredSelection(selected ? [selected] : [], { providerId: '', model: '' })); },
    selectModel: model => { setAllowCloud(false); setSelection(previous => ({ ...previous, model })); },
  };
  return <AnalysisContext.Provider value={value}>{children}<LogAnalysisSidebar /></AnalysisContext.Provider>;
};

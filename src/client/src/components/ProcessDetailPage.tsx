import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PM2Process } from '../types/pm2';
import ProcessLogs from './ProcessLogs';
import LogFileBrowser from './LogFileBrowser';
import MetricsChart from './MetricsChart';
import axios from 'axios';
import PageHeader from './PageHeader';

// @group Types : Tab panel props
interface TabPanelProps {
  children?: React.ReactNode;
  active: boolean;
}

// @group TabPanel : Renders tab content when active
const TabPanel: React.FC<TabPanelProps> = ({ children, active }) => {
  if (!active) return null;
  return <div className="p-4">{children}</div>;
};

// @group Types : Process detail page props
interface ProcessDetailPageProps {
  onAction?: (id: number, action: string) => void;
  /** When set, loads process from the given remote connection instead of local PM2 */
  connectionId?: string;
}

// @group Utilities : Status badge color mapping
const statusPill = (status: string): string => {
  if (status === 'online')  return 'bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/30';
  if (status === 'stopped') return 'bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/30';
  return 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30';
};

// @group ProcessDetailPage : Detail view for a single PM2 process
const ProcessDetailPage: React.FC<ProcessDetailPageProps> = ({ onAction, connectionId }) => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [process, setProcess] = useState<PM2Process | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<number>(0);
  const navigate = useNavigate();

  // @group DataFetching : Load process details — local or remote based on connectionId
  useEffect(() => {
    const fetchProcess = async () => {
      try {
        const url = connectionId
          ? `/api/remote/${connectionId}/processes`
          : '/api/processes';
        const response = await axios.get<PM2Process[]>(url);
        const found = response.data.find(p => p.pm_id === Number(id));
        if (found) {
          setProcess(found);
        } else {
          setError(`Process with ID ${id} not found`);
        }
      } catch (err) {
        console.error('Error fetching process:', err);
        setError('Failed to fetch process details');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchProcess();
    const interval = setInterval(() => { if (id) fetchProcess(); }, 3000);
    return () => clearInterval(interval);
  }, [id, connectionId]);

  // @group Utilities : Format helpers
  const formatDate = (timestamp: number | undefined): string => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  };

  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // @group Handlers : Execute process lifecycle actions
  const executeAction = async (action: string): Promise<void> => {
    if (!process) return;
    try {
      if (onAction) {
        onAction(process.pm_id, action);
        if (action === 'delete') { navigate('/'); return; }
      } else {
        await axios.post(`/api/process/${process.pm_id}/${action}`);
      }
      const response = await axios.get<PM2Process[]>('/api/processes');
      const updated = response.data.find(p => p.pm_id === Number(id));
      if (updated) setProcess(updated);
    } catch (err) {
      console.error(`Error performing ${action}:`, err);
      setError(`Failed to ${action} process. ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // @group Render : Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2">
        <svg className="h-4 w-4 animate-spin text-[#22c55e]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <span className="text-[10px] font-mono text-[#555]">{t('processDetail.loadingDetails')}</span>
      </div>
    );
  }

  // @group Render : Error state
  if (error || !process) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {error && (
          <div className="text-[10px] font-mono text-[#ef4444] border border-[#ef4444]/20 bg-[#ef4444]/5 rounded-sm px-3 py-2">
            <span className="text-[#555]">err:</span> {error}
          </div>
        )}
        <button
          onClick={() => navigate('/')}
          className="w-fit h-7 px-3 text-[10px] font-mono rounded-sm border border-[#1e1e1e] text-[#555] hover:text-[#888] transition-colors"
        >
          &larr; {t('processDetail.backToList')}
        </button>
      </div>
    );
  }

  // @group Render : Tab definitions
  const tabs = [
    t('common.details'),
    t('common.logs'),
    'Log Files',
    t('common.metrics'),
  ];

  // @group Render : Quick stats data
  const quickStats = [
    { label: t('processDetail.cpuUsage'),  value: process.monit ? `${process.monit.cpu}%`          : t('common.na') },
    { label: t('common.memory'),           value: process.monit ? formatMemory(process.monit.memory) : t('common.na') },
    { label: t('common.restarts'),         value: String(process.pm2_env.restart_time) },
    { label: t('processDetail.startedAt'), value: formatDate(process.pm2_env.pm_uptime) },
  ];

  // @group Render : Main detail page layout
  return (
    <div>
      {/* @group PageHeader : Process name + action toolbar */}
      <PageHeader
        title={process.name}
        subtitle={`PID ${process.pm_id} · ${process.pm2_env.exec_mode || 'fork'} mode · ns: ${process.pm2_env.namespace || 'default'}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status badge */}
            <span className={`text-[9px] font-mono border rounded-sm px-2 py-0.5 ${statusPill(process.pm2_env.status)}`}>
              {process.pm2_env.status}
            </span>

            {/* Back */}
            <button
              onClick={() => navigate('/')}
              className="h-7 px-2.5 text-[10px] font-mono rounded-sm border border-[#1e1e1e] text-[#555] hover:text-[#888] transition-colors"
              title="Back to process list"
            >
              &larr; back
            </button>

            {/* Start */}
            <button
              onClick={() => executeAction('start')}
              disabled={process.pm2_env.status === 'online'}
              className="h-7 px-3 text-[10px] font-mono rounded-sm border border-[#22c55e]/50 text-[#22c55e]
                         hover:bg-[#22c55e]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('common.start')}
            </button>

            {/* Stop */}
            <button
              onClick={() => executeAction('stop')}
              disabled={process.pm2_env.status === 'stopped'}
              className="h-7 px-3 text-[10px] font-mono rounded-sm border border-[#ef4444]/50 text-[#ef4444]
                         hover:bg-[#ef4444]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('common.stop')}
            </button>

            {/* Restart */}
            <button
              onClick={() => executeAction('restart')}
              className="h-7 px-3 text-[10px] font-mono rounded-sm border border-[#f59e0b]/50 text-[#f59e0b]
                         hover:bg-[#f59e0b]/10 transition-colors"
            >
              {t('common.restart')}
            </button>

            {/* Delete */}
            <button
              onClick={() => executeAction('delete')}
              className="h-7 px-3 text-[10px] font-mono rounded-sm border border-[#ef4444]/30 text-[#ef4444]/70
                         hover:border-[#ef4444]/60 hover:text-[#ef4444] transition-colors"
            >
              {t('common.delete')}
            </button>
          </div>
        }
      />

      {/* @group QuickStats : CPU / memory / restarts / uptime row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#1e1e1e] border border-[#1e1e1e] rounded-sm mb-3 overflow-hidden">
        {quickStats.map(({ label, value }) => (
          <div key={label} className="bg-[#111] px-3 py-2.5">
            <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-0.5">{label}</div>
            <div className="text-[10px] font-mono text-[#e8e8e8] font-bold">{value}</div>
          </div>
        ))}
      </div>

      {/* @group TabContainer : Tabbed detail panels */}
      <div className="border border-[#1e1e1e] rounded-sm bg-[#111] overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-[#1e1e1e] bg-[#0d0d0d]">
          {tabs.map((tab, idx) => (
            <button
              key={tab}
              onClick={() => setActiveTab(idx)}
              className={`px-4 py-2 text-[10px] font-mono transition-colors border-b-2
                          ${activeTab === idx
                            ? 'text-[#e8e8e8] border-[#22c55e] bg-[#111]'
                            : 'text-[#555] border-transparent hover:text-[#888]'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Details tab */}
        <TabPanel active={activeTab === 0}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Process info column */}
            <div>
              <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-3">
                {t('processDetail.processDetails')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: t('common.namespace'),        value: process.pm2_env.namespace || 'default' },
                  { label: t('processDetail.execMode'),  value: process.pm2_env.exec_mode || t('common.na') },
                  { label: t('processDetail.instances'), value: String(process.pm2_env.instances || 1) },
                  { label: t('processDetail.createdAt'), value: formatDate(process.pm2_env.created_at) },
                  { label: t('common.restarts'),         value: String(process.pm2_env.restart_time) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-0.5">{label}</div>
                    <div className="text-[10px] font-mono text-[#e8e8e8]">{value}</div>
                  </div>
                ))}
                <div className="col-span-2">
                  <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-0.5">
                    {t('processDetail.scriptPath')}
                  </div>
                  <div className="text-[10px] font-mono text-[#e8e8e8] break-all">
                    {process.pm2_env.pm_exec_path}
                  </div>
                </div>
              </div>
            </div>

            {/* Env vars column */}
            <div>
              <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-3">
                {t('processDetail.environmentVariables')}
              </div>
              <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-sm p-3 max-h-60 overflow-auto">
                {process.pm2_env.env && Object.keys(process.pm2_env.env).length > 0 ? (
                  <pre className="m-0 text-[10px] font-mono text-[#e8e8e8] leading-relaxed whitespace-pre-wrap break-all">
                    {JSON.stringify(process.pm2_env.env, null, 2)}
                  </pre>
                ) : (
                  <span className="text-[10px] font-mono text-[#555]">{t('processDetail.noEnvVars')}</span>
                )}
              </div>
            </div>
          </div>
        </TabPanel>

        {/* Logs tab — live tail / history */}
        <TabPanel active={activeTab === 1}>
          <ProcessLogs
            processId={process.pm_id}
            processName={process.name}
            connectionId={connectionId}
          />
        </TabPanel>

        {/* Log Files tab — browse & download rotated files */}
        <TabPanel active={activeTab === 2}>
          <LogFileBrowser
            processId={process.pm_id}
            processName={process.name}
            connectionId={connectionId}
          />
        </TabPanel>

        {/* Metrics tab */}
        <TabPanel active={activeTab === 3}>
          <MetricsChart processId={process.pm_id} initialData={process} />
        </TabPanel>
      </div>
    </div>
  );
};

export default ProcessDetailPage;

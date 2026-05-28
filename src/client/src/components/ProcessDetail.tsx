import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PM2Process } from '../types/pm2';
import ProcessLogs from './ProcessLogs';
import MetricsChart from './MetricsChart';

// @group Types : Component props
interface ProcessDetailProps {
  process: PM2Process;
  onClose: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  active: boolean;
}

// @group TabPanel : Renders tab content when active
const TabPanel: React.FC<TabPanelProps> = ({ children, active }) => {
  if (!active) return null;
  return <div className="p-4">{children}</div>;
};

// @group Utilities : Status badge color mapping
const statusPill = (status: string): string => {
  if (status === 'online')  return 'bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/30';
  if (status === 'stopped') return 'bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/30';
  return 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30';
};

// @group ProcessDetail : Modal dialog for a single PM2 process
const ProcessDetail: React.FC<ProcessDetailProps> = ({ process, onClose }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<number>(0);

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

  // @group Render : Tab definitions
  const tabs = ['Information', 'Metrics', 'Logs', 'Environment'];

  // @group Render : Modal overlay + dialog
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="process-detail-dialog-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80"
        onClick={onClose}
      />

      {/* Dialog panel */}
      <div className="relative z-10 w-full max-w-5xl max-h-[90vh] flex flex-col
                      bg-[#111] border border-[#1e1e1e] rounded-sm shadow-2xl overflow-hidden">

        {/* @group DialogHeader : Title bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e] bg-[#0d0d0d] shrink-0">
          <div className="flex items-center gap-3">
            <span id="process-detail-dialog-title" className="text-[11px] font-mono font-bold text-[#e8e8e8]">
              {process.name}
            </span>
            <span className={`text-[9px] font-mono border rounded-sm px-2 py-0.5 ${statusPill(process.pm2_env.status)}`}>
              {process.pm2_env.status}
            </span>
            <span className="text-[10px] font-mono text-[#555]">
              id:{process.pm_id}
            </span>
          </div>
          <button
            aria-label="close"
            onClick={onClose}
            className="h-6 w-6 flex items-center justify-center rounded-sm text-[#555] hover:text-[#888] transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* @group TabBar : Tab navigation */}
        <div className="flex border-b border-[#1e1e1e] bg-[#0d0d0d] shrink-0">
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

        {/* @group DialogContent : Scrollable tab content */}
        <div className="flex-1 overflow-y-auto">

          {/* Information tab */}
          <TabPanel active={activeTab === 0}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Process status card */}
              <div className="bg-[#141414] border border-[#1e1e1e] rounded-sm p-3">
                <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-3">Process Status</div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'status',   value: process.pm2_env.status },
                    { label: 'restarts', value: String(process.pm2_env.restart_time) },
                    { label: 'uptime',
                      value: process.pm2_env.status === 'online'
                        ? formatDate(process.pm2_env.pm_uptime)
                        : 'not running' },
                    { label: 'created',  value: formatDate(process.pm2_env.created_at) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-0.5">{label}</div>
                      <div className="text-[10px] font-mono text-[#e8e8e8]">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resource usage card */}
              <div className="bg-[#141414] border border-[#1e1e1e] rounded-sm p-3">
                <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-3">Resource Usage</div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'cpu',    value: process.monit ? `${process.monit.cpu}%`          : 'N/A' },
                    { label: 'memory', value: process.monit ? formatMemory(process.monit.memory) : 'N/A' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-0.5">{label}</div>
                      <div className="text-[10px] font-mono text-[#e8e8e8] font-bold">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Process details card — full width */}
              <div className="bg-[#141414] border border-[#1e1e1e] rounded-sm p-3 md:col-span-2">
                <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-3">Process Details</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-0.5">script</div>
                    <div className="text-[10px] font-mono text-[#e8e8e8] truncate">{process.pm2_env.pm_exec_path}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-0.5">working dir</div>
                    <div className="text-[10px] font-mono text-[#e8e8e8] truncate">{process.pm2_env.pm_cwd}</div>
                  </div>
                  <div>
                    <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-0.5">interpreter</div>
                    <div className="text-[10px] font-mono text-[#e8e8e8]">{process.pm2_env.exec_interpreter}</div>
                  </div>
                  <div>
                    <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-0.5">watching</div>
                    <div className="text-[10px] font-mono text-[#e8e8e8]">{process.pm2_env.watch ? 'yes' : 'no'}</div>
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>

          {/* Metrics tab */}
          <TabPanel active={activeTab === 1}>
            <MetricsChart processId={process.pm_id} initialData={process} />
          </TabPanel>

          {/* Logs tab */}
          <TabPanel active={activeTab === 2}>
            <ProcessLogs processId={process.pm_id} processName={process.name} />
          </TabPanel>

          {/* Environment tab */}
          <TabPanel active={activeTab === 3}>
            <div className="bg-[#141414] border border-[#1e1e1e] rounded-sm p-3">
              <div className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mb-3">Environment Variables</div>
              {process.pm2_env.env ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(process.pm2_env.env)
                    .filter(([key]) => !key.startsWith('_') && key !== 'PATH')
                    .map(([key, value]) => (
                      <div
                        key={key}
                        className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-sm p-2"
                      >
                        <div className="text-[9px] font-mono text-[#22d3ee] mb-0.5 truncate">{key}</div>
                        <div className="text-[10px] font-mono text-[#e8e8e8] break-all whitespace-pre-wrap">
                          {String(value)}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <span className="text-[10px] font-mono text-[#555]">No environment variables found.</span>
                </div>
              )}
            </div>
          </TabPanel>
        </div>
      </div>
    </div>
  );
};

export default ProcessDetail;

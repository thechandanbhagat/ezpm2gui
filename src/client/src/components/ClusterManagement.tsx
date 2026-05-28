import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  ArrowPathIcon,
  ServerStackIcon,
  CpuChipIcon,
  ArrowsPointingOutIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import { PM2Process } from '../types/pm2';

// @group Types : Cluster management types
interface ClusterProcess {
  pm_id: number;
  name: string;
  instances: number;
  exec_mode: string;
  isCluster: boolean;
}

interface ClusterManagementProps {
  processes: PM2Process[];
  onRefresh: () => void;
}

// @group ClusterManagement : Process cluster scaling and exec-mode management
const ClusterManagement: React.FC<ClusterManagementProps> = ({ processes, onRefresh }) => {
  const { t } = useTranslation();
  const [selectedProcess, setSelectedProcess] = useState<string>('');
  const [clusterProcesses, setClusterProcesses] = useState<ClusterProcess[]>([]);
  const [instancesInput, setInstancesInput] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (selectedProcess) fetchClusterInfo(selectedProcess);
  }, [selectedProcess]);

  // @group DataFetching : Fetch cluster info for selected process
  const fetchClusterInfo = async (processId: string) => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/cluster/${processId}`);
      setClusterProcesses([response.data]);
      setInstancesInput(response.data.instances || 1);
    } catch {
      setError('Failed to fetch cluster information');
    } finally {
      setLoading(false);
    }
  };

  // @group Handlers : Cluster action handlers
  const handleScaleProcess = async () => {
    if (!selectedProcess || instancesInput < 0) return;
    try {
      setLoading(true);
      await axios.post(`/api/cluster/${selectedProcess}/scale`, { instances: instancesInput });
      await fetchClusterInfo(selectedProcess);
      setSuccess(`Scaled to ${instancesInput} instances`);
      onRefresh();
    } catch { setError('Failed to scale process'); }
    finally { setLoading(false); }
  };

  const handleChangeExecMode = async (mode: 'fork' | 'cluster') => {
    if (!selectedProcess) return;
    try {
      setLoading(true);
      await axios.post(`/api/cluster/${selectedProcess}/exec-mode`, { mode });
      await fetchClusterInfo(selectedProcess);
      setSuccess(`Execution mode changed to ${mode}`);
      onRefresh();
    } catch { setError('Failed to change execution mode'); }
    finally { setLoading(false); }
  };

  const handleReloadProcess = async () => {
    if (!selectedProcess) return;
    try {
      setLoading(true);
      await axios.post(`/api/cluster/${selectedProcess}/reload`);
      setSuccess('Process reloaded with zero downtime');
      onRefresh();
    } catch { setError('Failed to reload process'); }
    finally { setLoading(false); }
  };

  const proc = clusterProcesses[0];

  // @group Render : CLI-styled cluster management layout
  return (
    <div className="space-y-3">

      {/* Page header */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#555] mb-1">pm2 / cluster</p>
        <h1 className="text-sm font-mono font-bold text-[#e8e8e8]">▸ CLUSTER MANAGEMENT</h1>
        <p className="text-[10px] font-mono text-[#555] mt-0.5">{t('cluster.subtitle')}</p>
      </div>

      {/* Toast notifications */}
      {error && (
        <div className="flex items-center gap-2 border border-[#ef4444]/30 bg-[#1a0000] px-3 py-2 rounded-sm">
          <span className="flex-1 text-[10px] font-mono text-[#ef4444]">{error}</span>
          <button onClick={() => setError('')} className="text-[#ef4444] hover:text-[#f87171] text-xs font-mono">✕</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 border border-[#22c55e]/30 bg-[#001a00] px-3 py-2 rounded-sm">
          <span className="flex-1 text-[10px] font-mono text-[#22c55e]">{success}</span>
          <button onClick={() => setSuccess('')} className="text-[#22c55e] hover:text-[#4ade80] text-xs font-mono">✕</button>
        </div>
      )}

      {/* Process selector */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-3">
        <p className="text-[9px] font-mono text-[#555] uppercase tracking-[0.2em] mb-2 block">
          {t('cluster.selectProcess')}
        </p>
        <select
          value={selectedProcess}
          onChange={e => setSelectedProcess(e.target.value)}
          className="bg-[#0d0d0d] border border-[#1e1e1e] text-[#e8e8e8] font-mono text-xs rounded-sm px-2.5 py-1.5 focus:border-[#555] focus:outline-none w-full sm:w-72"
        >
          <option value="">{t('cluster.choosePlaceholder')}</option>
          {processes.map(p => (
            <option key={p.pm_id} value={p.pm_id}>{p.name} (ID: {p.pm_id})</option>
          ))}
        </select>
      </div>

      {/* Body states */}
      {loading ? (
        <div className="flex justify-center py-10">
          <ArrowPathIcon className="h-4 w-4 animate-spin text-[#555]" />
        </div>
      ) : !selectedProcess ? (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-8 text-center">
          <ServerStackIcon className="mx-auto h-7 w-7 text-[#333] mb-2" />
          <p className="text-[10px] font-mono text-[#555]">{t('cluster.selectHint')}</p>
        </div>
      ) : proc ? (
        <div className="space-y-3">

          {/* Current Status */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-sm overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e1e1e]">
              <CpuChipIcon className="h-3.5 w-3.5 text-[#555]" />
              <p className="text-[9px] font-mono text-[#555] uppercase tracking-[0.2em]">{t('cluster.currentStatus')}</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1e1e1e]">
                  {[t('common.id'), t('common.name'), t('cluster.instances'), t('cluster.execModeHeader'), t('common.mode')].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[9px] font-mono text-[#555] uppercase tracking-[0.15em]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clusterProcesses.map(p => (
                  <tr key={p.pm_id}>
                    <td className="px-3 py-2.5 text-[10px] font-mono text-[#888]">{p.pm_id}</td>
                    <td className="px-3 py-2.5 text-[11px] font-mono font-bold text-[#e8e8e8]">{p.name}</td>
                    <td className="px-3 py-2.5 text-[10px] font-mono text-[#22d3ee]">{p.instances}</td>
                    <td className="px-3 py-2.5 text-[10px] font-mono text-[#888]">{p.exec_mode}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex px-1.5 py-0.5 rounded-sm border text-[9px] font-mono ${
                        p.isCluster
                          ? 'text-[#a78bfa] border-[#a78bfa]/30 bg-[#16003a]'
                          : 'text-[#888] border-[#1e1e1e] bg-[#0d0d0d]'
                      }`}>
                        {p.isCluster ? 'cluster' : 'fork'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Scale Instances */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-3">
            <div className="flex items-center gap-2 mb-3">
              <ArrowsPointingOutIcon className="h-3.5 w-3.5 text-[#555]" />
              <p className="text-[9px] font-mono text-[#555] uppercase tracking-[0.2em]">{t('cluster.scaleInstances')}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setInstancesInput(v => Math.max(0, v - 1))}
                className="border border-[#1e1e1e] text-[#888] font-mono text-xs px-2 py-0.5 rounded-sm hover:border-[#333]"
              >
                −
              </button>
              <input
                type="number"
                min={0}
                value={instancesInput}
                onChange={e => setInstancesInput(Number(e.target.value))}
                className="bg-[#0d0d0d] border border-[#1e1e1e] text-[#e8e8e8] font-mono text-xs rounded-sm px-2.5 py-1.5 focus:border-[#555] focus:outline-none w-20 text-center"
              />
              <button
                onClick={() => setInstancesInput(v => v + 1)}
                className="border border-[#1e1e1e] text-[#888] font-mono text-xs px-2 py-0.5 rounded-sm hover:border-[#333]"
              >
                +
              </button>
              <button
                onClick={handleScaleProcess}
                disabled={loading}
                className="flex items-center gap-1.5 border border-[#1e1e1e] text-[#888] font-mono text-xs px-3 py-1.5 rounded-sm hover:border-[#333] hover:text-[#e8e8e8] disabled:opacity-40 disabled:cursor-not-allowed ml-1"
              >
                <ArrowsPointingOutIcon className="h-3 w-3" />
                {t('cluster.scale')}
              </button>
            </div>
          </div>

          {/* Execution Mode */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-3">
            <div className="flex items-center gap-2 mb-3">
              <ServerStackIcon className="h-3.5 w-3.5 text-[#555]" />
              <p className="text-[9px] font-mono text-[#555] uppercase tracking-[0.2em]">{t('cluster.executionMode')}</p>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => handleChangeExecMode('fork')}
                disabled={!proc.isCluster || loading}
                className="border border-[#1e1e1e] text-[#888] font-mono text-xs px-3 py-1.5 rounded-sm hover:border-[#333] hover:text-[#e8e8e8] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('cluster.switchToFork')}
              </button>
              <button
                onClick={() => handleChangeExecMode('cluster')}
                disabled={proc.isCluster || loading}
                className="border border-[#1e1e1e] text-[#888] font-mono text-xs px-3 py-1.5 rounded-sm hover:border-[#333] hover:text-[#e8e8e8] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('cluster.switchToCluster')}
              </button>
            </div>
            <p className="text-[10px] font-mono text-[#555]">
              {t('cluster.clusterModeDesc')}
            </p>
          </div>

          {/* Zero-Downtime Reload */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <BoltIcon className="h-3.5 w-3.5 text-[#f59e0b]" />
              <p className="text-[9px] font-mono text-[#555] uppercase tracking-[0.2em]">{t('cluster.zeroDowntimeReload')}</p>
            </div>
            <p className="text-[10px] font-mono text-[#555] mb-3">
              {t('cluster.reloadDesc')}
            </p>
            <button
              onClick={handleReloadProcess}
              disabled={loading}
              className="flex items-center gap-1.5 border border-[#f59e0b]/30 text-[#f59e0b] font-mono text-xs px-3 py-1.5 rounded-sm hover:border-[#f59e0b]/60 hover:bg-[#1a0e00] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <BoltIcon className="h-3 w-3" />
              {t('cluster.gracefulReload')}
            </button>
          </div>

        </div>
      ) : null}
    </div>
  );
};

export default ClusterManagement;

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
import PageHeader from './PageHeader';

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

  // @group Render : Cluster management layout
  return (
    <div>
      <PageHeader
        title={t('cluster.title')}
        subtitle={t('cluster.subtitle')}
      />

      {/* Toast notifications */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
          <span className="flex-1">{success}</span>
          <button onClick={() => setSuccess('')} className="text-emerald-400 hover:text-emerald-600">✕</button>
        </div>
      )}

      {/* Process selector */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 mb-4">
        <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">{t('cluster.selectProcess')}</p>
        <select
          value={selectedProcess}
          onChange={e => setSelectedProcess(e.target.value)}
          className="w-full sm:w-72 h-8 px-3 text-xs rounded border
                     bg-white dark:bg-neutral-800
                     border-neutral-200 dark:border-neutral-700
                     text-neutral-900 dark:text-neutral-100
                     focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="">{t('cluster.choosePlaceholder')}</option>
          {processes.map(p => (
            <option key={p.pm_id} value={p.pm_id}>{p.name} (ID: {p.pm_id})</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <ArrowPathIcon className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : !selectedProcess ? (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center">
          <ServerStackIcon className="mx-auto h-8 w-8 text-neutral-300 dark:text-neutral-600 mb-2" />
          <p className="text-xs text-neutral-400 dark:text-neutral-500">{t('cluster.selectHint')}</p>
        </div>
      ) : proc ? (
        <div className="grid grid-cols-1 gap-4">

          {/* Current Status */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
              <CpuChipIcon className="h-3.5 w-3.5 text-neutral-400" />
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{t('cluster.currentStatus')}</p>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-100 dark:border-neutral-800">
                  {[t('common.id'), t('common.name'), t('cluster.instances'), t('cluster.execModeHeader'), t('common.mode')].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clusterProcesses.map(p => (
                  <tr key={p.pm_id} className="text-neutral-700 dark:text-neutral-300">
                    <td className="px-4 py-2.5">{p.pm_id}</td>
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className="px-4 py-2.5">{p.instances}</td>
                    <td className="px-4 py-2.5 font-mono">{p.exec_mode}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-1.5 py-0.5 rounded border text-[11px] font-medium ${
                        p.isCluster
                          ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border-primary-400/30'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-300 dark:border-neutral-700'
                      }`}>
                        {p.isCluster ? 'Cluster' : 'Fork'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Scale Instances */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <ArrowsPointingOutIcon className="h-3.5 w-3.5 text-neutral-400" />
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{t('cluster.scaleInstances')}</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                value={instancesInput}
                onChange={e => setInstancesInput(Number(e.target.value))}
                className="w-24 h-8 px-3 text-xs rounded border
                           bg-white dark:bg-neutral-800
                           border-neutral-200 dark:border-neutral-700
                           text-neutral-900 dark:text-neutral-100
                           focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <button
                onClick={handleScaleProcess}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded
                           bg-primary-600 hover:bg-primary-700 text-white transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowsPointingOutIcon className="h-3.5 w-3.5" />
                {t('cluster.scale')}
              </button>
            </div>
          </div>

          {/* Execution Mode */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <ServerStackIcon className="h-3.5 w-3.5 text-neutral-400" />
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{t('cluster.executionMode')}</p>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => handleChangeExecMode('fork')}
                disabled={!proc.isCluster}
                className="px-3 py-1.5 text-xs font-medium rounded border transition-colors
                           border-neutral-200 dark:border-neutral-700
                           text-neutral-700 dark:text-neutral-300
                           hover:bg-neutral-50 dark:hover:bg-neutral-800
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('cluster.switchToFork')}
              </button>
              <button
                onClick={() => handleChangeExecMode('cluster')}
                disabled={proc.isCluster}
                className="px-3 py-1.5 text-xs font-medium rounded border transition-colors
                           border-neutral-200 dark:border-neutral-700
                           text-neutral-700 dark:text-neutral-300
                           hover:bg-neutral-50 dark:hover:bg-neutral-800
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('cluster.switchToCluster')}
              </button>
            </div>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {t('cluster.clusterModeDesc')}
            </p>
          </div>

          {/* Zero-Downtime Reload */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <BoltIcon className="h-3.5 w-3.5 text-amber-400" />
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{t('cluster.zeroDowntimeReload')}</p>
            </div>
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mb-3">
              {t('cluster.reloadDesc')}
            </p>
            <button
              onClick={handleReloadProcess}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded
                         bg-amber-500 hover:bg-amber-600 text-white transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <BoltIcon className="h-3.5 w-3.5" />
              {t('cluster.gracefulReload')}
            </button>
          </div>

        </div>
      ) : null}
    </div>
  );
};

export default ClusterManagement;

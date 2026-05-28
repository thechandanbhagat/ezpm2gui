import React, { useState, useEffect } from 'react';
import {
  ArrowPathIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  PlayIcon,
  StopIcon,
  ClockIcon,
  CodeBracketIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import CronJobDialog from './CronJobDialog';
import ConfirmationDialog from './ConfirmationDialog';
import PageHeader from './PageHeader';
import { CronJobConfig, CronJobStatus } from '../types/cron';
import { useTranslation } from 'react-i18next';

// @group CronJobsPage : Cron job management page
const CronJobsPage: React.FC = () => {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<CronJobStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJobConfig | undefined>();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);

  // @group DataFetching : Load cron jobs from API
  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/cron-jobs/status');
      if (response.data.success) setJobs(response.data.data);
    } catch (error) {
      console.error('Error fetching cron jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJobs(); }, []);

  // @group Handlers : CRUD and toggle handlers
  const handleCreate = () => { setEditingJob(undefined); setDialogOpen(true); };
  const handleEdit   = (job: CronJobConfig) => { setEditingJob(job); setDialogOpen(true); };

  const handleSave = async (jobData: Omit<CronJobConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      if (editingJob) {
        await axios.put(`/api/cron-jobs/${editingJob.id}`, jobData);
      } else {
        await axios.post('/api/cron-jobs', jobData);
      }
      fetchJobs();
      setDialogOpen(false);
    } catch (error) {
      console.error('Error saving cron job:', error);
      throw error;
    }
  };

  const handleDelete = async () => {
    if (!jobToDelete) return;
    try {
      await axios.delete(`/api/cron-jobs/${jobToDelete}`);
      fetchJobs();
      setDeleteConfirmOpen(false);
      setJobToDelete(null);
    } catch (error) {
      console.error('Error deleting cron job:', error);
    }
  };

  const handleToggle = async (jobId: string) => {
    try { await axios.post(`/api/cron-jobs/${jobId}/toggle`); fetchJobs(); }
    catch (error) { console.error('Error toggling cron job:', error); }
  };

  const handleStart = async (jobId: string) => {
    try { await axios.post(`/api/cron-jobs/${jobId}/start`); fetchJobs(); }
    catch (error) { console.error('Error starting cron job:', error); }
  };

  const handleStop = async (jobId: string) => {
    try { await axios.post(`/api/cron-jobs/${jobId}/stop`); fetchJobs(); }
    catch (error) { console.error('Error stopping cron job:', error); }
  };

  // @group Utilities : Badge color helpers
  const scriptTypeBadge = (type: string) => {
    const map: Record<string, string> = {
      node:   'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20',
      python: 'bg-[#22d3ee]/10 text-[#22d3ee] border-[#22d3ee]/20',
      shell:  'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20',
      dotnet: 'bg-[#a78bfa]/10 text-[#a78bfa] border-[#a78bfa]/20',
    };
    return map[type] ?? 'bg-[#1e1e1e] text-[#888] border-[#333]';
  };

  // @group Render : Page layout
  return (
    <div className="space-y-3">
      <PageHeader
        title={t('cronJobs.title')}
        subtitle={t('cronJobs.subtitle')}
        actions={
          <>
            <button
              onClick={fetchJobs}
              disabled={loading}
              className="flex items-center gap-1.5 border border-[#333] text-[#888] text-xs font-mono px-3 py-1 rounded-sm hover:border-[#555] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </button>
            <button
              onClick={handleCreate}
              className="flex items-center gap-1.5 bg-[#e8e8e8] text-[#0a0a0a] text-xs font-mono font-semibold px-3 py-1 rounded-sm transition-colors hover:bg-white"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {t('cronJobs.createJob')}
            </button>
          </>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { id: 'total',     label: t('cronJobs.total'),     value: jobs.length,                                                color: 'text-[#e8e8e8]' },
          { id: 'enabled',   label: t('cronJobs.enabled'),   value: jobs.filter(j => j.config.enabled).length,                 color: 'text-[#22c55e]' },
          { id: 'running',   label: t('cronJobs.running'),   value: jobs.filter(j => j.isRunning).length,                      color: 'text-[#22d3ee]' },
          { id: 'scheduled', label: t('cronJobs.scheduled'), value: jobs.filter(j => j.config.enabled && !j.isRunning).length, color: 'text-[#f59e0b]' },
        ].map(({ id, label, value, color }) => (
          <div key={id} className="bg-[#111] border border-[#1e1e1e] rounded-sm px-3 py-2">
            <p className={`text-[11px] font-mono font-bold leading-none ${color}`}>{value}</p>
            <p className="text-[9px] font-mono text-[#555] uppercase tracking-[0.15em] mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Jobs Table / Empty state */}
      {jobs.length === 0 ? (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-10 text-center">
          <ClockIcon className="mx-auto h-8 w-8 text-[#333] mb-3" />
          <p className="text-[10px] font-mono text-[#555]">{t('cronJobs.noJobs')}</p>
          <p className="text-[10px] font-mono text-[#444] mt-1 mb-4">
            Create your first scheduled task to automate your workflows
          </p>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-1.5 bg-[#e8e8e8] text-[#0a0a0a] text-xs font-mono font-semibold px-3 py-1 rounded-sm transition-colors hover:bg-white"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Create First Job
          </button>
        </div>
      ) : (
        <div className="border border-[#1e1e1e] rounded-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#0d0d0d] border-b border-[#1e1e1e]">
                {[
                  { id: 'name',    label: t('common.name') },
                  { id: 'type',    label: t('cronJobs.type') },
                  { id: 'sched',   label: t('cronJobs.cronSchedule') },
                  { id: 'next',    label: t('cronJobs.nextRun') },
                  { id: 'status',  label: t('common.status') },
                  { id: 'enabled', label: t('cronJobs.enabled') },
                  { id: 'actions', label: '' },
                ].map(({ id, label }) => (
                  <th key={id} className="px-3 py-2.5 text-left text-[9px] font-mono text-[#444] uppercase tracking-[0.15em] whitespace-nowrap">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a]">
              {jobs.map((job) => (
                <tr key={job.config.id} className="bg-[#0a0a0a] hover:bg-[#111] transition-colors">
                  {/* Name */}
                  <td className="px-3 py-2.5">
                    <p className="text-[10px] font-mono font-semibold text-[#e8e8e8]">{job.config.name}</p>
                    {job.config.description && (
                      <p className="text-[10px] font-mono text-[#555] mt-0.5">{job.config.description}</p>
                    )}
                  </td>

                  {/* Type */}
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[10px] font-mono font-medium ${scriptTypeBadge(job.config.scriptType)}`}>
                      <CodeBracketIcon className="h-3 w-3 shrink-0" />
                      {job.config.scriptType.toUpperCase()}
                    </span>
                  </td>

                  {/* Schedule */}
                  <td className="px-3 py-2.5">
                    <code className="font-mono text-[10px] text-[#888]">{job.config.cronExpression}</code>
                  </td>

                  {/* Next Run */}
                  <td className="px-3 py-2.5 text-[10px] font-mono text-[#888] whitespace-nowrap">
                    {job.nextExecution ? new Date(job.nextExecution).toLocaleString() : '—'}
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2.5">
                    {job.isRunning ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[10px] font-mono font-medium bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20">
                        <CheckCircleIcon className="h-3 w-3" /> {t('common.running')}
                      </span>
                    ) : job.config.enabled ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[10px] font-mono font-medium bg-[#1e1e1e] text-[#888] border-[#333]">
                        {t('common.scheduled')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[10px] font-mono font-medium bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20">
                        <XCircleIcon className="h-3 w-3" /> {t('cronJobs.disabled')}
                      </span>
                    )}
                  </td>

                  {/* Toggle */}
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => handleToggle(job.config.id)}
                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent
                                  transition-colors duration-200 cursor-pointer
                                  ${job.config.enabled ? 'bg-[#22c55e]' : 'bg-[#333]'}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-[#e8e8e8] shadow
                                        transform transition-transform duration-200
                                        ${job.config.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-0.5 justify-end">
                      {job.isRunning ? (
                        <button
                          onClick={() => handleStop(job.config.id)}
                          title="Stop"
                          className="p-1 rounded-sm text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors"
                        >
                          <StopIcon className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStart(job.config.id)}
                          title="Start"
                          className="p-1 rounded-sm text-[#22c55e] hover:bg-[#22c55e]/10 transition-colors"
                        >
                          <PlayIcon className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(job.config)}
                        title={t('common.edit')}
                        className="p-1 rounded-sm text-[#555] hover:bg-[#1e1e1e] hover:text-[#888] transition-colors"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => { setJobToDelete(job.config.id); setDeleteConfirmOpen(true); }}
                        title={t('common.delete')}
                        className="p-1 rounded-sm text-[#555] hover:bg-[#ef4444]/10 hover:text-[#ef4444] transition-colors"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <CronJobDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingJob(undefined); }}
        onSave={handleSave}
        editJob={editingJob}
      />
      <ConfirmationDialog
        isOpen={deleteConfirmOpen}
        title={t('cronJobs.deleteCronJobTitle')}
        message={t('cronJobs.deleteCronJobMessage')}
        onConfirm={handleDelete}
        onCancel={() => { setDeleteConfirmOpen(false); setJobToDelete(null); }}
        type="danger"
      />
    </div>
  );
};

export default CronJobsPage;

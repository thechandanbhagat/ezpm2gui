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

// @group CronJobsPage : Cron job management page
const CronJobsPage: React.FC = () => {
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
      node:   'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-400/30',
      python: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-400/30',
      shell:  'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-400/30',
      dotnet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-400/30',
    };
    return map[type] ?? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-300 dark:border-neutral-700';
  };

  // @group Render : Page layout
  return (
    <div>
      <PageHeader
        title="Cron Jobs"
        subtitle="Schedule and manage automated tasks using PM2's cron feature"
        actions={
          <>
            <button
              onClick={fetchJobs}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border
                         border-neutral-200 dark:border-neutral-700
                         text-neutral-700 dark:text-neutral-300
                         hover:bg-neutral-50 dark:hover:bg-neutral-800
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded
                         bg-primary-600 hover:bg-primary-700 text-white transition-colors"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Create Job
            </button>
          </>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total',     value: jobs.length,                                               color: 'text-primary-600 dark:text-primary-400' },
          { label: 'Enabled',   value: jobs.filter(j => j.config.enabled).length,                color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Running',   value: jobs.filter(j => j.isRunning).length,                     color: 'text-sky-600 dark:text-sky-400' },
          { label: 'Scheduled', value: jobs.filter(j => j.config.enabled && !j.isRunning).length, color: 'text-amber-600 dark:text-amber-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3">
            <p className={`text-xl font-bold leading-none ${color}`}>{value}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Jobs Table / Empty state */}
      {jobs.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-10 text-center">
          <ClockIcon className="mx-auto h-8 w-8 text-neutral-300 dark:text-neutral-600 mb-3" />
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">No cron jobs yet</p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 mb-4">
            Create your first scheduled task to automate your workflows
          </p>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded
                       bg-primary-600 hover:bg-primary-700 text-white transition-colors"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Create First Job
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60">
                {['Name', 'Type', 'Schedule', 'Next Run', 'Status', 'Enabled', ''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {jobs.map((job) => (
                <tr key={job.config.id} className="bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                  {/* Name */}
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-neutral-900 dark:text-neutral-100">{job.config.name}</p>
                    {job.config.description && (
                      <p className="text-neutral-400 dark:text-neutral-500 mt-0.5">{job.config.description}</p>
                    )}
                  </td>

                  {/* Type */}
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium ${scriptTypeBadge(job.config.scriptType)}`}>
                      <CodeBracketIcon className="h-3 w-3 shrink-0" />
                      {job.config.scriptType.toUpperCase()}
                    </span>
                  </td>

                  {/* Schedule */}
                  <td className="px-3 py-2.5">
                    <code className="font-mono text-neutral-600 dark:text-neutral-400">{job.config.cronExpression}</code>
                  </td>

                  {/* Next Run */}
                  <td className="px-3 py-2.5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                    {job.nextExecution ? new Date(job.nextExecution).toLocaleString() : '—'}
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2.5">
                    {job.isRunning ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-400/30">
                        <CheckCircleIcon className="h-3 w-3" /> Running
                      </span>
                    ) : job.config.enabled ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-300 dark:border-neutral-700">
                        Scheduled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 border-red-400/30">
                        <XCircleIcon className="h-3 w-3" /> Disabled
                      </span>
                    )}
                  </td>

                  {/* Toggle */}
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => handleToggle(job.config.id)}
                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent
                                  transition-colors duration-200 cursor-pointer
                                  ${job.config.enabled ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600'}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow
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
                          className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <StopIcon className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStart(job.config.id)}
                          title="Start"
                          className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                        >
                          <PlayIcon className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(job.config)}
                        title="Edit"
                        className="p-1 rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-primary-600 transition-colors"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => { setJobToDelete(job.config.id); setDeleteConfirmOpen(true); }}
                        title="Delete"
                        className="p-1 rounded text-neutral-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
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
        title="Delete Cron Job"
        message="Are you sure you want to delete this cron job? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => { setDeleteConfirmOpen(false); setJobToDelete(null); }}
        type="danger"
      />
    </div>
  );
};

export default CronJobsPage;

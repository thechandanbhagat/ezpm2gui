import React from 'react';
import { Link } from 'react-router-dom';
import { PM2Process } from '../types/pm2';
import {
  InformationCircleIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
  ArrowPathIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

interface ProcessListProps {
  processes: PM2Process[];
  onAction: (id: number, action: string) => void;
}

const ProcessList: React.FC<ProcessListProps> = ({ processes, onAction }) => {
  // Helper function to format memory usage
  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };



  if (processes.length === 0) {
    return (
      <div className="card-premium p-16 text-center animate-fade-in">
        <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-2xl bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-700 mb-8 shadow-lg">
          <InformationCircleIcon className="h-10 w-10 text-neutral-600 dark:text-neutral-400" />
        </div>
        <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4 tracking-tight">
          No PM2 Processes Found
        </h3>
        <p className="text-lg text-neutral-500 dark:text-neutral-400 max-w-md mx-auto leading-relaxed">
          Make sure PM2 is running and has active processes to display them here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-3 py-2 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">PM2 Processes</h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {processes.length}
          </span>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Process
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Performance
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {processes.map((process) => (
              <tr key={process.pm_id} className="hover:bg-gray-50 group">
                <td className="px-3 py-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-blue-100 rounded-md flex items-center justify-center">
                      <span className="text-blue-600 font-semibold text-xs">
                        {process.pm_id}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-900">
                        {process.name}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                    process.pm2_env.status === 'online' ? 'bg-green-100 text-green-800' :
                    process.pm2_env.status === 'stopped' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    <div className={`w-1 h-1 rounded-full mr-1 ${
                      process.pm2_env.status === 'online' ? 'bg-green-500' :
                      process.pm2_env.status === 'stopped' ? 'bg-red-500' :
                      'bg-yellow-500'
                    }`}></div>
                    {process.pm2_env.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">CPU:</span>
                        <div className="flex items-center space-x-1">
                          <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 rounded-full transition-all duration-300"
                              style={{ width: `${process.monit ? Math.min(process.monit.cpu, 100) : 0}%` }}
                            ></div>
                          </div>
                          <span className="text-xs font-medium text-gray-900 min-w-[2rem]">
                            {process.monit ? `${process.monit.cpu}%` : 'N/A'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">RAM:</span>
                        <span className="text-xs font-medium text-gray-900">
                          {process.monit ? formatMemory(process.monit.memory) : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </td>
                <td className="px-3 py-2">
                    <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                      <Link
                        to={`/process/${process.pm_id}`}
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-100 hover:bg-blue-200 text-blue-600 hover:text-blue-700 transition-all duration-150"
                        title="Details"
                      >
                        <InformationCircleIcon className="h-3 w-3" />
                      </Link>
                      
                      {process.pm2_env.status === 'online' ? (
                        <>
                          <button
                            onClick={() => onAction(process.pm_id, 'restart')}
                            className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-yellow-100 hover:bg-yellow-200 text-yellow-600 hover:text-yellow-700 transition-all duration-150"
                            title="Restart"
                          >
                            <ArrowPathIcon className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => onAction(process.pm_id, 'stop')}
                            className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 transition-all duration-150"
                            title="Stop"
                          >
                            <StopIcon className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => onAction(process.pm_id, 'start')}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-green-100 hover:bg-green-200 text-green-600 hover:text-green-700 transition-all duration-150"
                          title="Start"
                        >
                          <PlayIcon className="h-3 w-3" />
                        </button>
                      )}
                      
                      <button
                        onClick={() => onAction(process.pm_id, 'delete')}
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 transition-all duration-150"
                        title="Delete"
                      >
                        <TrashIcon className="h-3 w-3" />
                      </button>
                      
                      <Link
                        to={`/logs/${process.pm_id}`}
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-700 transition-all duration-150"
                        title="Logs"
                      >
                        <DocumentTextIcon className="h-3 w-3" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

  );
};

export default ProcessList;

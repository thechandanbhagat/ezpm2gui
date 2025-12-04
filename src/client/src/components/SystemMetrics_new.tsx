// import React from 'react';
// import { SystemMetricsData } from '../types/pm2';
// import { 
//   CpuChipIcon,
//   ChartBarIcon,
//   ClockIcon,
//   ServerIcon
// } from '@heroicons/react/24/outline';

// interface SystemMetricsProps {
//   metrics: SystemMetricsData;
// }

// const SystemMetrics: React.FC<SystemMetricsProps> = ({ metrics }) => {
//   // Helper function to format memory usage
//   const formatMemory = (bytes: number): string => {
//     if (bytes === 0) return '0 B';
//     const sizes = ['B', 'KB', 'MB', 'GB'];
//     const i = Math.floor(Math.log(bytes) / Math.log(1024));
//     return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
//   };

//   // Helper function to format uptime
//   const formatUptime = (seconds: number): string => {
//     const days = Math.floor(seconds / (3600 * 24));
//     const hours = Math.floor((seconds % (3600 * 24)) / 3600);
//     const minutes = Math.floor((seconds % 3600) / 60);
    
//     let result = '';
//     if (days > 0) result += `${days}d `;
//     if (hours > 0) result += `${hours}h `;
//     result += `${minutes}m`;
    
//     return result;
//   };

//   // Calculate memory usage percentage
//   const memoryUsagePercent = Math.round((metrics.memory.used / metrics.memory.total) * 100);
  
//   // Determine memory usage status color classes
//   const getMemoryStatusClasses = (percent: number) => {
//     if (percent > 90) return 'from-danger-500 to-danger-600 text-white';
//     if (percent > 70) return 'from-warning-500 to-warning-600 text-white';
//     return 'from-success-500 to-success-600 text-white';
//   };
  
//   // Determine load average status color classes
//   const getLoadStatusClasses = (load: number, cores: number) => {
//     const ratio = load / cores;
//     if (ratio > 0.8) return 'from-danger-500 to-danger-600 text-white';
//     if (ratio > 0.5) return 'from-warning-500 to-warning-600 text-white';
//     return 'from-success-500 to-success-600 text-white';
//   };

//   return (
//     <div className="space-y-8">
//       <div>
//         <h2 className="text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">
//           System Metrics
//         </h2>
//         <p className="text-lg text-neutral-500 dark:text-neutral-400 mt-2">
//           Real-time system performance overview
//         </p>
//       </div>
      
//       <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
//         {/* CPU Cores */}
//         <div className="card-premium card-content-compact group hover:scale-105 transition-all duration-300">
//           <div className="flex items-center justify-between mb-6">
//             <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-lg">
//               <CpuChipIcon className="h-6 w-6 text-white" />
//             </div>
//             <span className="badge badge-info">CPU</span>
//           </div>
//           <div className="space-y-2">
//             <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
//               CPU Cores
//             </h3>
//             <p className="text-3xl font-bold text-neutral-900 dark:text-white">
//               {metrics.cpus}
//             </p>
//             <p className="text-sm text-neutral-500 dark:text-neutral-400">
//               Available processing cores
//             </p>
//           </div>
//         </div>

//         {/* Load Average */}
//         <div className="card-premium card-content-compact group hover:scale-105 transition-all duration-300">
//           <div className="flex items-center justify-between mb-6">
//             <div className={`w-12 h-12 bg-gradient-to-br ${getLoadStatusClasses(metrics.loadAvg[0], metrics.cpus)} rounded-xl flex items-center justify-center shadow-lg`}>
//               <ChartBarIcon className="h-6 w-6" />
//             </div>
//             <span className="badge bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
//               1m
//             </span>
//           </div>
//           <div className="space-y-2">
//             <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
//               Load Average
//             </h3>
//             <p className="text-3xl font-bold text-neutral-900 dark:text-white">
//               {metrics.loadAvg[0].toFixed(2)}
//             </p>
//             <div className="flex justify-between text-sm text-neutral-500 dark:text-neutral-400 pt-2 border-t border-neutral-200 dark:border-neutral-700">
//               <span>5m: {metrics.loadAvg[1].toFixed(2)}</span>
//               <span>15m: {metrics.loadAvg[2].toFixed(2)}</span>
//             </div>
//           </div>
//         </div>

//         {/* Memory Usage */}
//         <div className="card-premium card-content-compact group hover:scale-105 transition-all duration-300">
//           <div className="flex items-center justify-between mb-6">
//             <div className={`w-12 h-12 bg-gradient-to-br ${getMemoryStatusClasses(memoryUsagePercent)} rounded-xl flex items-center justify-center shadow-lg`}>
//               <ServerIcon className="h-6 w-6" />
//             </div>
//             <span className={`badge ${memoryUsagePercent > 90 ? 'badge-danger' : memoryUsagePercent > 70 ? 'badge-warning' : 'badge-success'}`}>
//               {memoryUsagePercent > 90 ? 'Critical' : memoryUsagePercent > 70 ? 'High' : 'Normal'}
//             </span>
//           </div>
//           <div className="space-y-3">
//             <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
//               Memory Usage
//             </h3>
//             <div className="flex items-baseline space-x-2">
//               <p className="text-3xl font-bold text-neutral-900 dark:text-white">
//                 {memoryUsagePercent}%
//               </p>
//               <p className="text-sm text-neutral-500 dark:text-neutral-400">
//                 of {formatMemory(metrics.memory.total)}
//               </p>
//             </div>
//             <div className="space-y-2">
//               <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-3 overflow-hidden">
//                 <div 
//                   className={`h-full bg-gradient-to-r ${getMemoryStatusClasses(memoryUsagePercent)} transition-all duration-500 ease-out`}
//                   style={{ width: `${memoryUsagePercent}%` }}
//                 ></div>
//               </div>
//               <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
//                 <span>{formatMemory(metrics.memory.used)} used</span>
//                 <span>{formatMemory(metrics.memory.free)} free</span>
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* System Uptime */}
//         <div className="card-premium card-content-compact group hover:scale-105 transition-all duration-300">
//           <div className="flex items-center justify-between mb-6">
//             <div className="w-12 h-12 bg-gradient-to-br from-accent-500 to-accent-600 rounded-xl flex items-center justify-center shadow-lg">
//               <ClockIcon className="h-6 w-6 text-white" />
//             </div>
//             <span className="badge bg-accent-100 text-accent-800 dark:bg-accent-900/20 dark:text-accent-400">
//               Live
//             </span>
//           </div>
//           <div className="space-y-2">
//             <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
//               System Uptime
//             </h3>
//             <p className="text-2xl font-bold text-neutral-900 dark:text-white">
//               {formatUptime(metrics.uptime)}
//             </p>
//             <p className="text-sm text-neutral-500 dark:text-neutral-400">
//               Since last reboot
//             </p>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default SystemMetrics;
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChartBarIcon,
  CpuChipIcon,
  PlusIcon,
  PuzzlePieceIcon,
  DocumentTextIcon,
  ServerStackIcon,
  ChartPieIcon,
  InformationCircleIcon,
  Cog6ToothIcon,
  ScaleIcon,
  CloudIcon,
  PresentationChartLineIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface SidebarMenuProps {
  toggleAbout: () => void;
  onItemClick?: () => void;
}

const SidebarMenu: React.FC<SidebarMenuProps> = ({ toggleAbout, onItemClick }) => {
  const location = useLocation();
  const currentPath = location.pathname;

  const handleItemClick = () => {
    if (onItemClick) {
      onItemClick();
    }
  };

  const isActive = (path: string) => {
    if (path === '/' && (currentPath === '/' || currentPath === '/processes')) {
      return true;
    }
    return currentPath === path;
  };

  const menuItems = [
    { 
      label: 'Processes', 
      path: '/processes', 
      icon: ChartBarIcon 
    },
    { 
      label: 'Monitoring', 
      path: '/monit', 
      icon: CpuChipIcon 
    },
    { 
      label: 'Advanced Monitoring', 
      path: '/advanced-monitoring', 
      icon: PresentationChartLineIcon 
    },
    { 
      label: 'Enhanced Logs', 
      path: '/enhanced-logs', 
      icon: ClipboardDocumentListIcon 
    },
    { 
      label: 'Remote Servers', 
      path: '/remote', 
      icon: CloudIcon 
    },
    { 
      label: 'Deploy New App', 
      path: '/deploy', 
      icon: PlusIcon 
    },
    { 
      label: 'PM2 Modules', 
      path: '/modules', 
      icon: PuzzlePieceIcon 
    },
    { 
      label: 'Ecosystem Config', 
      path: '/ecosystem', 
      icon: DocumentTextIcon 
    },
    { 
      label: 'Cluster Management', 
      path: '/cluster', 
      icon: ServerStackIcon 
    },
    { 
      label: 'Cron Jobs', 
      path: '/cron-jobs', 
      icon: ClockIcon 
    },
    { 
      label: 'Load Balancing Guide', 
      path: '/load-balancing-guide', 
      icon: ScaleIcon 
    },
    { 
      label: 'Log Streaming', 
      path: '/logs', 
      icon: ChartPieIcon
    },
  ];

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Navigation - Compact */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="space-y-1">
          <div className="px-2 pb-1">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Process Management
            </h3>
          </div>
          
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={handleItemClick}
                className={`
                  group flex items-center px-2 py-2 text-xs font-medium rounded-md transition-all duration-200 relative
                  ${isActive(item.path)
                    ? 'bg-blue-100 text-blue-700 border-l-2 border-blue-500'
                    : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }
                `}
              >
                <div className={`
                  flex items-center justify-center w-6 h-6 rounded-md mr-2 transition-all duration-200
                  ${isActive(item.path)
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-600 group-hover:bg-gray-300'
                  }
                `}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="truncate font-medium">{item.label}</span>
                {isActive(item.path) && (
                  <div className="absolute right-2 w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                )}
              </Link>
            );
          })}
        </div>

        {/* System Section - Compact */}
        <div className="pt-4 space-y-1 border-t border-gray-200 mt-4">
          <div className="px-2 pb-1">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              System
            </h3>
          </div>
          
          <button
            onClick={() => { toggleAbout(); handleItemClick(); }}
            className="w-full group flex items-center px-2 py-2 text-xs font-medium rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-all duration-200"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-md mr-2 bg-gray-200 text-gray-600 group-hover:bg-gray-300 transition-all duration-200">
              <InformationCircleIcon className="h-3.5 w-3.5" />
            </div>
            <span className="truncate font-medium">About</span>
          </button>
          
          <Link
            to="/settings"
            onClick={handleItemClick}
            className={`
              group flex items-center px-2 py-2 text-xs font-medium rounded-md transition-all duration-200 relative
              ${isActive('/settings')
                ? 'bg-blue-100 text-blue-700 border-l-2 border-blue-500'
                : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              }
            `}
          >
            <div className={`
              flex items-center justify-center w-6 h-6 rounded-md mr-2 transition-all duration-200
              ${isActive('/settings')
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-600 group-hover:bg-gray-300'
              }
            `}>
              <Cog6ToothIcon className="h-3.5 w-3.5" />
            </div>
            <span className="truncate font-medium">Settings</span>
            {isActive('/settings') && (
              <div className="absolute right-2 w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
            )}
          </Link>
        </div>
      </nav>
    </div>
  );
};

export default SidebarMenu;

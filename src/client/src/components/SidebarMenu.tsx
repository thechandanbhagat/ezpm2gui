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
  ClockIcon,
} from '@heroicons/react/24/outline';

interface SidebarMenuProps {
  toggleAbout: () => void;
  onItemClick?: () => void;
}

// @group SidebarMenu : Navigation menu for the application sidebar
const SidebarMenu: React.FC<SidebarMenuProps> = ({ toggleAbout, onItemClick }) => {
  const location = useLocation();
  const currentPath = location.pathname;

  const handleItemClick = () => onItemClick?.();

  const isActive = (path: string) => {
    if (path === '/' && (currentPath === '/' || currentPath === '/processes')) return true;
    return currentPath === path;
  };

  // @group Navigation : Menu items configuration
  const menuItems = [
    { label: 'Processes',            path: '/processes',          icon: ChartBarIcon },
    { label: 'Monitoring',           path: '/monit',              icon: CpuChipIcon },
    { label: 'Adv. Monitoring',      path: '/advanced-monitoring',icon: PresentationChartLineIcon },
    { label: 'Remote Servers',       path: '/remote',             icon: CloudIcon },
    { label: 'Deploy App',           path: '/deploy',             icon: PlusIcon },
    { label: 'PM2 Modules',          path: '/modules',            icon: PuzzlePieceIcon },
    { label: 'Ecosystem Config',     path: '/ecosystem',          icon: DocumentTextIcon },
    { label: 'Cluster',             path: '/cluster',            icon: ServerStackIcon },
    { label: 'Cron Jobs',            path: '/cron-jobs',          icon: ClockIcon },
    { label: 'Load Balancing',       path: '/load-balancing-guide', icon: ScaleIcon },
    { label: 'Log Streaming',        path: '/logs',               icon: ChartPieIcon },
  ];

  // @group Render : Sidebar layout with sections
  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900">

      {/* ── Process Management ── */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto">
        <p className="px-1.5 mb-1 text-xs font-semibold text-neutral-400 dark:text-neutral-600 uppercase tracking-widest">
          Management
        </p>

        <div className="space-y-0.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={handleItemClick}
                className={`
                  flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium
                  transition-colors duration-100
                  ${active
                    ? 'bg-primary-600 text-white'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100'
                  }
                `}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-white' : 'text-neutral-500 dark:text-neutral-500'}`} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* ── System ── */}
        <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-0.5">
          <p className="px-1.5 mb-1 text-xs font-semibold text-neutral-400 dark:text-neutral-600 uppercase tracking-widest">
            System
          </p>

          <button
            onClick={() => { toggleAbout(); handleItemClick(); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium
                       text-neutral-600 dark:text-neutral-400
                       hover:bg-neutral-100 dark:hover:bg-neutral-800
                       hover:text-neutral-900 dark:hover:text-neutral-100
                       transition-colors duration-100"
          >
            <InformationCircleIcon className="h-3.5 w-3.5 shrink-0 text-neutral-500 dark:text-neutral-500" />
            <span>About</span>
          </button>

          <Link
            to="/settings"
            onClick={handleItemClick}
            className={`
              flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium
              transition-colors duration-100
              ${isActive('/settings')
                ? 'bg-primary-600 text-white'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100'
              }
            `}
          >
            <Cog6ToothIcon className={`h-3.5 w-3.5 shrink-0 ${isActive('/settings') ? 'text-white' : 'text-neutral-500 dark:text-neutral-500'}`} />
            <span>Settings</span>
          </Link>
        </div>
      </nav>
    </div>
  );
};

export default SidebarMenu;

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RemoteConnection } from '../types/remote';
import {
  ServerStackIcon,
  ChevronDownIcon,
  CheckIcon,
  SignalIcon,
  SignalSlashIcon,
} from '@heroicons/react/24/outline';

// @group Types : Component props
interface ServerSwitcherProps {
  activeServerId: string;
  connections: RemoteConnection[];
  darkMode: boolean;
  onSwitch: (serverId: string) => void;
}

// @group ServerSwitcher : Global server context switcher in the top nav bar
const ServerSwitcher: React.FC<ServerSwitcherProps> = ({
  activeServerId,
  connections,
  onSwitch,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  // @group Handlers : Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // @group Derived : Active server display info
  const activeConn = connections.find(c => c.id === activeServerId);
  const activeLabel = activeServerId === 'local' ? 'Local' : (activeConn?.name || 'Remote');
  const isConnected = activeServerId === 'local' || (activeConn?.connected ?? false);

  return (
    <div ref={ref} className="relative">

      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-mono border border-[#1e1e1e] bg-[#111] text-[#888] hover:border-[#333] transition-colors"
        title={t('serverSwitcher.title')}
      >
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isConnected ? 'bg-[#22c55e]' : 'bg-[#333]'}`} />
        <ServerStackIcon className="h-3 w-3 shrink-0" />
        <span className="max-w-[100px] truncate">{activeLabel}</span>
        <ChevronDownIcon className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full mt-1.5 right-0 w-60 bg-[#111] border border-[#1e1e1e] rounded-sm shadow-2xl z-50 py-1">

          {/* Local option */}
          <button
            onClick={() => { onSwitch('local'); setOpen(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-[#1a1a1a] font-mono text-[10px]
              ${activeServerId === 'local' ? 'text-[#e8e8e8] bg-[#1a1a1a]' : 'text-[#888] hover:text-[#e8e8e8]'}`}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e] shrink-0" />
            <div className="flex-1 min-w-0">
              <div>{t('serverSwitcher.local')}</div>
              <div className="text-[9px] text-[#555] mt-0.5">{t('serverSwitcher.localhost')}</div>
            </div>
            {activeServerId === 'local' && (
              <CheckIcon className="h-3 w-3 shrink-0 text-[#555]" />
            )}
          </button>

          {connections.length > 0 && (
            <>
              <div className="my-1 border-t border-[#1e1e1e]" />
              <p className="px-3 py-1 text-[9px] font-mono text-[#444] uppercase tracking-[0.15em]">
                {t('serverSwitcher.remoteServers')}
              </p>

              {connections.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onSwitch(c.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-[#1a1a1a] font-mono text-[10px]
                    ${activeServerId === c.id ? 'text-[#e8e8e8] bg-[#1a1a1a]' : 'text-[#888] hover:text-[#e8e8e8]'}`}
                >
                  {c.connected
                    ? <SignalIcon className="h-3.5 w-3.5 shrink-0 text-[#22c55e]" />
                    : <SignalSlashIcon className="h-3.5 w-3.5 shrink-0 text-[#555]" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{c.name}</div>
                    <div className="text-[9px] text-[#555] truncate mt-0.5">{c.username}@{c.host}</div>
                  </div>
                  {activeServerId === c.id && (
                    <CheckIcon className="h-3 w-3 shrink-0 text-[#555]" />
                  )}
                </button>
              ))}
            </>
          )}

        </div>
      )}

    </div>
  );
};

export default ServerSwitcher;

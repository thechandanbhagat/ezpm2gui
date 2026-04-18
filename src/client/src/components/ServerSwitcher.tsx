import React, { useState, useRef, useEffect } from 'react';
import { RemoteConnection } from '../types/remote';
import {
  ServerStackIcon,
  ChevronDownIcon,
  CheckIcon,
  SignalIcon,
  SignalSlashIcon,
} from '@heroicons/react/24/outline';

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
  darkMode,
  onSwitch,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium
                   border transition-colors duration-100
                   ${darkMode
                     ? 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                     : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                   }`}
        title="Switch active server"
      >
        {/* Connection status dot */}
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          isConnected ? 'bg-green-500' : 'bg-neutral-400'
        }`} />
        <ServerStackIcon className="h-3 w-3 shrink-0" />
        <span className="max-w-[100px] truncate">{activeLabel}</span>
        <ChevronDownIcon className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className={`absolute top-full mt-1.5 right-0 w-60 rounded-lg shadow-xl border z-50 py-1
                        ${darkMode
                          ? 'bg-neutral-800 border-neutral-700'
                          : 'bg-white border-neutral-200'
                        }`}>

          {/* Local option */}
          <button
            onClick={() => { onSwitch('local'); setOpen(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors
                       ${darkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-50'}
                       ${activeServerId === 'local'
                         ? (darkMode ? 'text-primary-400' : 'text-primary-600')
                         : (darkMode ? 'text-neutral-200' : 'text-neutral-700')
                       }`}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium">Local</div>
              <div className={`text-xs ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>
                localhost
              </div>
            </div>
            {activeServerId === 'local' && (
              <CheckIcon className="h-3.5 w-3.5 shrink-0 text-primary-500" />
            )}
          </button>

          {connections.length > 0 && (
            <>
              <div className={`my-1 border-t ${darkMode ? 'border-neutral-700' : 'border-neutral-100'}`} />
              <p className={`px-3 py-1 text-xs uppercase tracking-wider font-semibold
                            ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>
                Remote Servers
              </p>

              {connections.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onSwitch(c.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors
                             ${darkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-50'}
                             ${activeServerId === c.id
                               ? (darkMode ? 'text-primary-400' : 'text-primary-600')
                               : (darkMode ? 'text-neutral-200' : 'text-neutral-700')
                             }`}
                >
                  {/* Connection status */}
                  {c.connected
                    ? <SignalIcon className="h-3.5 w-3.5 shrink-0 text-green-500" />
                    : <SignalSlashIcon className={`h-3.5 w-3.5 shrink-0 ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`} />
                  }

                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className={`truncate ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>
                      {c.username}@{c.host}
                    </div>
                  </div>

                  {activeServerId === c.id && (
                    <CheckIcon className="h-3.5 w-3.5 shrink-0 text-primary-500" />
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

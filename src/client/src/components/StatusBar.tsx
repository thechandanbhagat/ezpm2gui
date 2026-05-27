import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  XMarkIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  SignalIcon,
  SignalSlashIcon,
} from '@heroicons/react/24/outline';

// @group Types : Notification item
export interface Notification {
  id: string;
  message: string;
  type: 'error' | 'warn' | 'success' | 'info';
}

// @group Types : Idle status bar data
export interface StatusBarStatus {
  connected: boolean;
  processCount: number;
  onlineCount: number;
  activeServer: string;
}

interface StatusBarProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
  status: StatusBarStatus;
}

// @group Utilities: Per-type visual config
const TYPE_CONFIG = {
  error:   { label: 'ERR',     labelClass: 'bg-red-600 text-white',                   icon: ExclamationCircleIcon,   textClass: 'text-red-300' },
  warn:    { label: 'WARN',    labelClass: 'bg-amber-500 text-white',                 icon: ExclamationTriangleIcon, textClass: 'text-amber-200' },
  success: { label: 'OK',      labelClass: 'bg-emerald-600 text-white',               icon: CheckCircleIcon,         textClass: 'text-emerald-300' },
  info:    { label: 'INFO',    labelClass: 'bg-sky-600 text-white',                   icon: InformationCircleIcon,   textClass: 'text-sky-200' },
};

// @group StatusBar : Single-row persistent footer — tips at rest, notifications inline
const StatusBar: React.FC<StatusBarProps> = ({ notifications, onDismiss, status }) => {
  const { t } = useTranslation();
  const TIPS = [
    t('statusBar.tip1'),
    t('statusBar.tip2'),
    t('statusBar.tip3'),
    t('statusBar.tip4'),
    t('statusBar.tip5'),
    t('statusBar.tip6'),
    t('statusBar.tip7'),
    t('statusBar.tip8'),
    t('statusBar.tip9'),
  ];
  const current = notifications[0];

  // @group TipRotator : Cycle through tips every 8 s
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [tipVisible, setTipVisible] = useState(true);
  const tipTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    tipTimerRef.current = setInterval(() => {
      setTipVisible(false);
      setTimeout(() => {
        setTipIndex(i => (i + 1) % TIPS.length);
        setTipVisible(true);
      }, 400);
    }, 8000);
    return () => { if (tipTimerRef.current) clearInterval(tipTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // @group NotifTimer : Auto-dismiss current notification after 10 s
  const [notifVisible, setNotifVisible] = useState(false);
  useEffect(() => {
    if (!current) { setNotifVisible(false); return; }
    const show  = setTimeout(() => setNotifVisible(true), 10);
    const fade  = setTimeout(() => setNotifVisible(false), 9000);
    const gone  = setTimeout(() => onDismiss(current.id), 10000);
    return () => { clearTimeout(show); clearTimeout(fade); clearTimeout(gone); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const remaining = notifications.length - 1;

  // @group Render : Single thin bar
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] flex items-center h-[22px]
                    bg-neutral-900 dark:bg-[#0d1117] border-t border-neutral-800 dark:border-neutral-900
                    text-[11px] select-none">

      {/* ── Left: connection + server + counts ── */}
      <div className="flex items-center shrink-0 h-full">

        {/* Connection */}
        <div className={`flex items-center gap-1 px-2.5 h-full border-r border-neutral-800 dark:border-neutral-900 ${
          status.connected
            ? 'text-emerald-400 hover:bg-emerald-900/20'
            : 'text-red-400 hover:bg-red-900/20'
        } transition-colors cursor-default`}>
          {status.connected
            ? <SignalIcon className="h-3 w-3 shrink-0" />
            : <SignalSlashIcon className="h-3 w-3 shrink-0 animate-pulse" />}
          <span className="font-medium">{status.connected ? t('common.connected') : t('common.disconnected')}</span>
        </div>

        {/* Server */}
        <div className="flex items-center px-2.5 h-full border-r border-neutral-800 dark:border-neutral-900
                        text-neutral-400 hover:bg-neutral-800/60 transition-colors cursor-default">
          {status.activeServer === 'local' ? t('serverSwitcher.local') : status.activeServer}
        </div>

        {/* Process counts */}
        <div className="flex items-center gap-1 px-2.5 h-full border-r border-neutral-800 dark:border-neutral-900
                        text-neutral-400 hover:bg-neutral-800/60 transition-colors cursor-default">
          <span className="font-semibold text-neutral-200">{status.onlineCount}</span>
          <span className="text-neutral-600">/</span>
          <span>{status.processCount}</span>
          <span className="text-neutral-500 ml-0.5">{t('monitDashboard.online')}</span>
        </div>
      </div>

      {/* ── Centre: tip or notification ── */}
      <div className="flex-1 flex items-center gap-2 px-3 min-w-0 overflow-hidden">
        {current ? (
          // Notification mode
          <div className={`flex items-center gap-2 min-w-0 transition-opacity duration-300 ${notifVisible ? 'opacity-100' : 'opacity-0'}`}>
            {(() => {
              const cfg = TYPE_CONFIG[current.type] ?? TYPE_CONFIG.info;
              return (
                <>
                  <span className={`shrink-0 text-[9px] font-bold px-1.5 py-px rounded ${cfg.labelClass}`}>
                    {cfg.label}
                  </span>
                  <span className={`truncate font-medium ${cfg.textClass}`}>{current.message}</span>
                  {remaining > 0 && (
                    <span className="shrink-0 text-[9px] font-semibold bg-neutral-700 text-neutral-300 rounded-full px-1.5 py-px">
                      +{remaining}
                    </span>
                  )}
                  <button
                    onClick={() => onDismiss(current.id)}
                    className="shrink-0 text-neutral-500 hover:text-neutral-300 transition-colors ml-0.5"
                    aria-label={t('statusBar.dismiss')}
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </>
              );
            })()}
          </div>
        ) : (
          // Tip mode
          <div className={`flex items-center gap-2 min-w-0 transition-opacity duration-400 ${tipVisible ? 'opacity-100' : 'opacity-0'}`}>
            <span className="shrink-0 text-[9px] font-bold px-1.5 py-px rounded bg-violet-700/80 text-violet-200">
              {t('statusBar.tip')}
            </span>
            <span className="truncate text-neutral-500">{TIPS[tipIndex]}</span>
          </div>
        )}
      </div>

      {/* ── Right: version ── */}
      <div className="shrink-0 px-3 text-neutral-600 hover:text-neutral-400 transition-colors cursor-default">
        v1.6.0
      </div>
    </div>
  );
};

export default StatusBar;

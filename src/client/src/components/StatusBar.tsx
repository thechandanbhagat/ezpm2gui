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

// @group Utilities : Per-type visual config — hardcoded dark CLI palette
const TYPE_CONFIG = {
  error:   { label: 'ERR',  labelClass: 'bg-red-700 text-[#e8e8e8]',          icon: ExclamationCircleIcon,   textClass: 'text-red-400' },
  warn:    { label: 'WARN', labelClass: 'bg-amber-700 text-[#e8e8e8]',         icon: ExclamationTriangleIcon, textClass: 'text-amber-400' },
  success: { label: 'OK',   labelClass: 'bg-emerald-800 text-[#22c55e]',       icon: CheckCircleIcon,         textClass: 'text-[#22c55e]' },
  info:    { label: 'INFO', labelClass: 'bg-[#0d1a2a] text-[#22d3ee]',         icon: InformationCircleIcon,   textClass: 'text-[#22d3ee]' },
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
    const show = setTimeout(() => setNotifVisible(true), 10);
    const fade = setTimeout(() => setNotifVisible(false), 9000);
    const gone = setTimeout(() => onDismiss(current.id), 10000);
    return () => { clearTimeout(show); clearTimeout(fade); clearTimeout(gone); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const remaining = notifications.length - 1;

  // @group Render : Single thin bar — always dark CLI style, no dark: variants
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] flex items-center h-[22px]
                    bg-[#0a0a0a] border-t border-[#1a1a1a]
                    font-mono text-[10px] select-none">

      {/* ── Left: connection + server + counts ── */}
      <div className="flex items-center shrink-0 h-full">

        {/* Connection */}
        <div className={`flex items-center gap-1 px-2.5 h-full border-r border-[#1a1a1a] transition-colors cursor-default ${
          status.connected
            ? 'text-[#22c55e] hover:bg-[#22c55e]/5'
            : 'text-[#ef4444] hover:bg-[#ef4444]/5'
        }`}>
          {status.connected
            ? <SignalIcon className="h-3 w-3 shrink-0" />
            : <SignalSlashIcon className="h-3 w-3 shrink-0 animate-pulse" />}
          <span className="font-mono">{status.connected ? t('common.connected') : t('common.disconnected')}</span>
        </div>

        {/* Server */}
        <div className="flex items-center px-2.5 h-full border-r border-[#1a1a1a]
                        text-[#888] font-mono hover:bg-white/[0.02] transition-colors cursor-default">
          {status.activeServer === 'local' ? t('serverSwitcher.local') : status.activeServer}
        </div>

        {/* Process counts */}
        <div className="flex items-center gap-1 px-2.5 h-full border-r border-[#1a1a1a]
                        text-[#888] font-mono hover:bg-white/[0.02] transition-colors cursor-default">
          <span className="font-bold text-[#22c55e]">{status.onlineCount}</span>
          <span className="text-[#333]">/</span>
          <span>{status.processCount}</span>
          <span className="text-[#555] ml-0.5">{t('monitDashboard.online')}</span>
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
                  <span className={`shrink-0 text-[9px] font-mono font-bold px-1.5 py-px rounded-sm ${cfg.labelClass}`}>
                    {cfg.label}
                  </span>
                  <span className={`truncate font-mono ${cfg.textClass}`}>{current.message}</span>
                  {remaining > 0 && (
                    <span className="shrink-0 text-[9px] font-mono font-semibold bg-[#1a1a1a] text-[#888] rounded-sm px-1.5 py-px">
                      +{remaining}
                    </span>
                  )}
                  <button
                    onClick={() => onDismiss(current.id)}
                    className="shrink-0 text-[#555] hover:text-[#888] transition-colors ml-0.5"
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
          <div className={`flex items-center gap-2 min-w-0 transition-opacity duration-[400ms] ${tipVisible ? 'opacity-100' : 'opacity-0'}`}>
            <span className="shrink-0 text-[9px] font-mono px-1.5 py-px rounded-sm bg-[#1a0a3a] text-[#a78bfa]">
              {t('statusBar.tip')}
            </span>
            <span className="truncate font-mono text-[#555]">{TIPS[tipIndex]}</span>
          </div>
        )}
      </div>

      {/* ── Right: version ── */}
      <div className="shrink-0 px-3 font-mono text-[#555] hover:text-[#888] transition-colors cursor-default">
        v1.6.0
      </div>
    </div>
  );
};

export default StatusBar;

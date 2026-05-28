import React from 'react';
import {
  ShieldCheckIcon,
  LockClosedIcon,
  LockOpenIcon,
  KeyIcon,
  ClockIcon,
  SparklesIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// @group Types
interface ChangeItem {
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  tag: 'New' | 'Improved' | 'Fix';
}

interface Release {
  version: string;
  date: string;
  headline: string;
  changes: ChangeItem[];
}

// @group Constants : Changelog data
const RELEASES: Release[] = [
  {
    version: '1.6.0',
    date: 'April 2026',
    headline: 'App Security & Lock Screen',
    changes: [
      {
        title: 'PIN Lock Screen',
        description:
          'Protect the app with a 4-digit PIN. The lock screen shows a numeric keypad that auto-submits on the 4th digit. Keyboard entry is also supported.',
        icon: KeyIcon,
        color: 'text-[#a78bfa]',
        tag: 'New',
      },
      {
        title: 'Password Protection',
        description:
          'Optionally require a password before the app is accessible. Set, change, or remove password protection from the Security section in Settings.',
        icon: ShieldCheckIcon,
        color: 'text-[#22d3ee]',
        tag: 'New',
      },
      {
        title: 'Lock / Unlock Toggle',
        description:
          'A lock button in the top navbar lets you manually lock the app at any time. Reopening the tab restores your unlocked session automatically.',
        icon: LockClosedIcon,
        color: 'text-[#e8e8e8]',
        tag: 'New',
      },
      {
        title: 'Session Persistence',
        description:
          'Once unlocked, the session stays unlocked through page refreshes within the same browser tab — no need to re-enter credentials on every reload.',
        icon: LockOpenIcon,
        color: 'text-[#22c55e]',
        tag: 'New',
      },
      {
        title: 'Auto-Lock on Inactivity',
        description:
          'Configure an inactivity timeout (in minutes) from Settings > Security. The app automatically locks after the specified idle period. Set to 0 to disable.',
        icon: ClockIcon,
        color: 'text-[#f59e0b]',
        tag: 'New',
      },
      {
        title: 'PIN + Password Dual Mode',
        description:
          'When both PIN and password are configured, the lock screen shows a toggle so you can choose which method to use. Defaults to PIN for convenience.',
        icon: SparklesIcon,
        color: 'text-[#a78bfa]',
        tag: 'Improved',
      },
    ],
  },
];

// @group Helpers : Tag badge styles
const TAG_STYLES: Record<ChangeItem['tag'], string> = {
  New:      'text-[9px] font-mono text-[#22c55e] border border-[#22c55e]/30 bg-[#022c00] px-1.5 py-0.5 rounded-sm',
  Improved: 'text-[9px] font-mono text-[#22d3ee] border border-[#22d3ee]/30 bg-[#001a1f] px-1.5 py-0.5 rounded-sm',
  Fix:      'text-[9px] font-mono text-[#f59e0b] border border-[#f59e0b]/30 bg-[#1a0e00] px-1.5 py-0.5 rounded-sm',
};

// @group Component : What's New changelog page
const WhatsNew: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">

      {/* ── Page header ── */}
      <div className="mb-8">
        <p className="text-[9px] uppercase tracking-[0.2em] text-[#555] mb-1">▸ WHAT'S NEW</p>
        <p className="text-[10px] font-mono text-[#555]">
          {t('whatsNew.pageSubtitle')}
        </p>
      </div>

      {/* ── Releases ── */}
      {RELEASES.map((release) => (
        <div key={release.version} className="mb-10">

          {/* Version header */}
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-[9px] font-bold px-2 py-0.5 border border-[#a78bfa]/30 text-[#a78bfa] bg-[#16003a] rounded-sm">
              v{release.version}
            </span>
            <span className="text-[11px] font-mono font-bold text-[#888] uppercase tracking-[0.1em]">
              {release.headline}
            </span>
            <span className="ml-auto text-[10px] font-mono text-[#444]">
              {release.date}
            </span>
          </div>

          {/* Divider */}
          <div className="h-px bg-[#1e1e1e] mb-4" />

          {/* Change cards grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            {release.changes.map((change) => {
              const Icon = change.icon;
              return (
                <div
                  key={change.title}
                  className="border border-[#1e1e1e] bg-[#111] rounded-sm p-3
                             hover:border-[#333] transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 w-7 h-7 flex items-center justify-center bg-[#1a1a1a] rounded-sm">
                      <Icon className={`h-3.5 w-3.5 ${change.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-mono font-semibold text-[#e8e8e8]">
                          {change.title}
                        </span>
                        <span className={`shrink-0 ${TAG_STYLES[change.tag]}`}>
                          {change.tag}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-[#555] leading-relaxed mt-0.5">
                        {change.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Footer CTA ── */}
      <div className="mt-6 border border-[#1e1e1e] bg-[#0d0d0d] rounded-sm p-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-mono font-bold text-[#e8e8e8] mb-0.5">
            {t('whatsNew.configureSecurity')}
          </p>
          <p className="text-[10px] font-mono text-[#555]">
            {t('whatsNew.configureSecurityDesc')}
          </p>
        </div>
        <Link
          to="/settings"
          className="flex items-center gap-1.5 bg-[#e8e8e8] text-[#0a0a0a] font-mono text-xs font-semibold px-3 py-1.5 rounded-sm
                     hover:bg-[#ccc] transition-colors"
        >
          {t('whatsNew.openSettings')}
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
        </Link>
      </div>

    </div>
  );
};

export default WhatsNew;

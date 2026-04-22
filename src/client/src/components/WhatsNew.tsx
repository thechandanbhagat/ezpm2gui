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
        color: 'text-violet-500',
        tag: 'New',
      },
      {
        title: 'Password Protection',
        description:
          'Optionally require a password before the app is accessible. Set, change, or remove password protection from the Security section in Settings.',
        icon: ShieldCheckIcon,
        color: 'text-blue-500',
        tag: 'New',
      },
      {
        title: 'Lock / Unlock Toggle',
        description:
          'A lock button in the top navbar lets you manually lock the app at any time. Reopening the tab restores your unlocked session automatically.',
        icon: LockClosedIcon,
        color: 'text-primary-500',
        tag: 'New',
      },
      {
        title: 'Session Persistence',
        description:
          'Once unlocked, the session stays unlocked through page refreshes within the same browser tab — no need to re-enter credentials on every reload.',
        icon: LockOpenIcon,
        color: 'text-green-500',
        tag: 'New',
      },
      {
        title: 'Auto-Lock on Inactivity',
        description:
          'Configure an inactivity timeout (in minutes) from Settings > Security. The app automatically locks after the specified idle period. Set to 0 to disable.',
        icon: ClockIcon,
        color: 'text-orange-500',
        tag: 'New',
      },
      {
        title: 'PIN + Password Dual Mode',
        description:
          'When both PIN and password are configured, the lock screen shows a toggle so you can choose which method to use. Defaults to PIN for convenience.',
        icon: SparklesIcon,
        color: 'text-pink-500',
        tag: 'Improved',
      },
    ],
  },
];

// @group Helpers
const TAG_STYLES: Record<ChangeItem['tag'], string> = {
  New:      'bg-green-500/10 text-green-500 border border-green-500/20',
  Improved: 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
  Fix:      'bg-orange-500/10 text-orange-500 border border-orange-500/20',
};

// @group Component : What's New changelog page
const WhatsNew: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">

      {/* ── Page header ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <SparklesIcon className="h-5 w-5 text-primary-500" />
          <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            What's New
          </h1>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Latest updates and improvements to EZ PM2 GUI
        </p>
      </div>

      {/* ── Releases ── */}
      {RELEASES.map((release) => (
        <div key={release.version} className="mb-10">

          {/* Version header */}
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-600 text-white tracking-wide">
              v{release.version}
            </span>
            <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              {release.headline}
            </span>
            <span className="ml-auto text-xs text-neutral-400 dark:text-neutral-600">
              {release.date}
            </span>
          </div>

          {/* Divider */}
          <div className="h-px bg-neutral-200 dark:bg-neutral-800 mb-4" />

          {/* Change cards grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            {release.changes.map((change) => {
              const Icon = change.icon;
              return (
                <div
                  key={change.title}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800
                             bg-white dark:bg-neutral-900 p-4
                             hover:border-neutral-300 dark:hover:border-neutral-700
                             transition-colors duration-150"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 w-8 h-8 rounded-md bg-neutral-100 dark:bg-neutral-800
                                    flex items-center justify-center">
                      <Icon className={`h-4 w-4 ${change.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                          {change.title}
                        </span>
                        <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TAG_STYLES[change.tag]}`}>
                          {change.tag}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
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
      <div className="mt-6 rounded-lg border border-neutral-200 dark:border-neutral-800
                      bg-neutral-50 dark:bg-neutral-900/50 p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-0.5">
            Configure Security
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500">
            Set up PIN and password protection from Settings.
          </p>
        </div>
        <Link
          to="/settings"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md
                     bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium
                     transition-colors duration-150"
        >
          Open Settings
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
        </Link>
      </div>

    </div>
  );
};

export default WhatsNew;

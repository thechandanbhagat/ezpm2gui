import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  XMarkIcon,
  SparklesIcon,
  ChartBarIcon,
  SignalIcon,
  ClockIcon,
  CircleStackIcon,
  CpuChipIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

// @group Constants
const VERSION = '1.7.0';
const STORAGE_KEY = `ezpm2_whats_new_seen_v${VERSION}`;

// @group Types
interface HighlightItem {
  icon: React.ElementType;
  color: string;
  bg: string;
  title: string;
  description: string;
}

interface WhatsNewModalProps {
  open: boolean;
  onClose: () => void;
  darkMode: boolean;
}

// @group Constants : Feature highlights for the popup
const HIGHLIGHTS: HighlightItem[] = [
  {
    icon: SignalIcon,
    color: 'text-indigo-500',
    bg: 'bg-indigo-500/10',
    title: 'Live Metrics Page',
    description: 'Per-process rolling 1-hour CPU and memory sparklines, updated every 3s. Find it under Metrics in the sidebar.',
  },
  {
    icon: ChartBarIcon,
    color: 'text-cyan-500',
    bg: 'bg-cyan-500/10',
    title: 'Metrics History (SQLite)',
    description: 'Remote process metrics recorded every 30s to a local SQLite DB. View CPU and memory charts across 30 min to 7 days.',
  },
  {
    icon: CpuChipIcon,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    title: 'Inline Sparklines',
    description: 'Every row in the Metrics table now shows a 1-hour CPU and memory micro-graph — no extra click required.',
  },
  {
    icon: CircleStackIcon,
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    title: 'Background Metrics Poller',
    description: 'Server-side poller samples connected remote servers every 30s regardless of which page you are on.',
  },
  {
    icon: ClockIcon,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    title: '30-Day Retention',
    description: 'Historical metrics auto-purge after 30 days to keep the database lean. Downsampling kicks in beyond 500 points.',
  },
];

// @group Helpers : Check & record whether this version popup was seen
export function shouldShowWhatsNew(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== '1';
}

export function markWhatsNewSeen(): void {
  localStorage.setItem(STORAGE_KEY, '1');
}

// @group Component : Compact "What's New" popup shown once per session
const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ open, onClose, darkMode }) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  // @group Effects : Close on Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // @group Effects : Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  // @group Styles
  const overlay   = 'fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm';
  const card      = `relative w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
    darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'
  }`;
  const textPri   = darkMode ? 'text-neutral-100' : 'text-neutral-900';
  const textMuted = darkMode ? 'text-neutral-400' : 'text-neutral-500';
  const divider   = darkMode ? 'border-neutral-800' : 'border-neutral-100';

  return (
    <div
      ref={overlayRef}
      className={overlay}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={card}>

        {/* ── Header ── */}
        <div className={`px-5 pt-5 pb-4 border-b ${divider}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Gradient icon */}
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-primary-600 flex items-center justify-center shrink-0">
                <SparklesIcon className="h-4.5 w-4.5 text-white h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className={`text-sm font-bold ${textPri}`}>What's New</h2>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-500 border border-violet-500/25 leading-none">
                    v{VERSION}
                  </span>
                </div>
                <p className={`text-[11px] mt-0.5 ${textMuted}`}>EZ PM2 GUI · April 2026</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-1 rounded-md transition-colors ${
                darkMode
                  ? 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
                  : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Highlights list ── */}
        <div className="px-5 py-3 space-y-2.5 max-h-72 overflow-y-auto">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex items-start gap-3">
                <div className={`mt-0.5 shrink-0 w-7 h-7 rounded-lg ${item.bg} flex items-center justify-center`}>
                  <Icon className={`h-3.5 w-3.5 ${item.color}`} />
                </div>
                <div>
                  <p className={`text-xs font-semibold leading-tight ${textPri}`}>{item.title}</p>
                  <p className={`text-[11px] leading-relaxed mt-0.5 ${textMuted}`}>{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div className={`px-5 py-3 border-t ${divider} flex items-center justify-between gap-3`}>
          <Link
            to="/whats-new"
            onClick={onClose}
            className={`flex items-center gap-1 text-xs font-medium transition-colors ${
              darkMode ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Full changelog
            <ArrowRightIcon className="h-3 w-3" />
          </Link>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold transition-colors"
          >
            Got it
          </button>
        </div>

      </div>
    </div>
  );
};

export default WhatsNewModal;

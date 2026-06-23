import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import { APP_RELEASE_SUBTITLE, APP_RELEASE_VERSION } from '../utils/release-info';

// @group Constants : Per-version popup display tracking
const STORAGE_KEY = `ezpm2_whats_new_seen_v${APP_RELEASE_VERSION}`;

// @group Types
interface HighlightItem {
  icon: React.ElementType;
  iconColor: string;
  titleKey: string;
  descKey: string;
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
    iconColor: 'text-[#a78bfa]',
    titleKey: 'whatsNew.feature1Title',
    descKey: 'whatsNew.feature1Desc',
  },
  {
    icon: ChartBarIcon,
    iconColor: 'text-[#22d3ee]',
    titleKey: 'whatsNew.feature2Title',
    descKey: 'whatsNew.feature2Desc',
  },
  {
    icon: CpuChipIcon,
    iconColor: 'text-[#22c55e]',
    titleKey: 'whatsNew.feature3Title',
    descKey: 'whatsNew.feature3Desc',
  },
  {
    icon: CircleStackIcon,
    iconColor: 'text-[#a78bfa]',
    titleKey: 'whatsNew.feature4Title',
    descKey: 'whatsNew.feature4Desc',
  },
  {
    icon: ClockIcon,
    iconColor: 'text-[#f59e0b]',
    titleKey: 'whatsNew.feature5Title',
    descKey: 'whatsNew.feature5Desc',
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
const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ open, onClose }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

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

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/70"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative w-full max-w-md border rounded-sm overflow-hidden bg-[#111] border-[#1e1e1e]">

        {/* ── Header ── */}
        <div className="px-4 pt-4 pb-3 border-b border-[#1a1a1a]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Icon */}
              <div className="w-8 h-8 bg-[#1a1a1a] border border-[#2a1a4a] rounded-sm flex items-center justify-center shrink-0">
                <SparklesIcon className="h-4 w-4 text-[#a78bfa]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[11px] font-mono font-bold text-[#e8e8e8] uppercase tracking-[0.1em]">
                    {t('whatsNew.title')}
                  </h2>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm bg-[#16003a] text-[#a78bfa] border border-[#a78bfa]/25">
                    v{APP_RELEASE_VERSION}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-[#555] mt-0.5">{APP_RELEASE_SUBTITLE}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[#444] hover:text-[#888] p-1 rounded-sm hover:bg-[#1a1a1a] transition-colors"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Highlights list ── */}
        <div className="px-4 py-3 space-y-2.5 max-h-72 overflow-y-auto">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.titleKey} className="flex items-start gap-3">
                <div className="shrink-0 w-6 h-6 rounded-sm bg-[#1a1a1a] flex items-center justify-center">
                  <Icon className={`h-3.5 w-3.5 ${item.iconColor}`} />
                </div>
                <div>
                  <p className="text-[11px] font-mono font-semibold text-[#e8e8e8] leading-tight">
                    {t(item.titleKey)}
                  </p>
                  <p className="text-[10px] font-mono text-[#555] leading-relaxed mt-0.5">
                    {t(item.descKey)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div className="px-4 py-3 border-t border-[#1a1a1a] flex items-center justify-between gap-3">
          <Link
            to="/whats-new"
            onClick={onClose}
            className="text-[10px] font-mono text-[#555] hover:text-[#888] flex items-center gap-1 transition-colors"
          >
            {t('whatsNew.fullChangelog')}
            <ArrowRightIcon className="h-3 w-3" />
          </Link>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-sm bg-[#e8e8e8] text-[#0a0a0a] text-xs font-mono font-semibold hover:bg-[#ccc] transition-colors"
          >
            {t('whatsNew.gotIt')}
          </button>
        </div>

      </div>
    </div>
  );
};

export default WhatsNewModal;

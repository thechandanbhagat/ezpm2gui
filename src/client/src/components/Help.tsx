import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowTopRightOnSquareIcon, ArrowRightIcon, PlayCircleIcon } from '@heroicons/react/24/outline';
import PageHeader from './PageHeader';
import { DEMO_VIDEOS, formatDemoDuration, youtubeEmbedUrl, youtubeWatchUrl } from '../utils/demo-videos';

const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ez-accent)]';
const linkClass = `inline-flex items-center gap-1.5 text-xs text-[var(--ez-text-muted)] underline underline-offset-4 hover:text-[var(--ez-text)] ${focusClass}`;

// @group Help : Published demos with click-to-load playback and documentation links.
const Help: React.FC = () => {
  const { t } = useTranslation();
  const [video, setVideo] = useState(DEMO_VIDEOS[0]);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const playerRef = useRef<HTMLIFrameElement>(null);
  const title = t(video.titleKey);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFailure = () => { setLoading(false); setFailed(true); };
    player.addEventListener('error', onFailure);
    return () => player.removeEventListener('error', onFailure);
  }, [video.id, playing, failed]);

  const play = () => { setFailed(false); setLoading(true); setPlaying(true); };

  return (
    <div className="max-w-6xl mx-auto text-[var(--ez-text)]">
      <PageHeader title={t('help.title')} subtitle={t('help.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section aria-labelledby="help-video-title" className="min-w-0">
          <div className="relative aspect-video overflow-hidden rounded-sm border border-[var(--ez-border)] bg-black">
            {playing && !failed ? (
              <>
                <iframe key={video.id} ref={playerRef} src={youtubeEmbedUrl(video)} title={`${title} · ${t('help.player')}`}
                  className="absolute inset-0 w-full h-full border-0"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  onLoad={() => setLoading(false)} />
                {loading && <p role="status" className="absolute bottom-3 left-3 right-3 bg-black/80 px-3 py-2 text-xs text-white pointer-events-none">{t('help.loadingPlayer')}</p>}
              </>
            ) : (
              <>
                <img src={`${process.env.PUBLIC_URL || ''}${video.posterPath}`} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={play} aria-label={t('help.playVideo', { title })}
                  style={{ outlineOffset: -4, outlineColor: '#ffffff' }}
                  className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/20 hover:bg-black/35 text-white ${focusClass}`}>
                  <PlayCircleIcon className="h-16 w-16 rounded-full bg-black/70" aria-hidden="true" />
                  <span className="rounded-sm bg-black/85 px-3 py-1.5 text-xs">{t(failed ? 'help.retryPlayer' : 'help.play')}</span>
                </button>
              </>
            )}
          </div>
          {failed && <p role="alert" className="mt-2 text-xs text-[var(--ez-text-muted)]">{t('help.playerError')}</p>}
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="help-video-title" className="text-base font-semibold">{title}</h2>
            <span className="text-xs text-[var(--ez-text-subtle)] tabular-nums">{formatDemoDuration(video.durationSeconds)} · {t('help.english')}</span>
          </div>
          <p className="mt-2 max-w-[70ch] text-xs leading-relaxed text-[var(--ez-text-muted)]">{t(video.descriptionKey)}</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link to={video.featurePath} className={`inline-flex items-center gap-2 border border-[var(--ez-border-strong)] rounded-sm px-3 py-2 text-xs hover:bg-[var(--ez-bg-hover)] ${focusClass}`}>
              {t(video.actionKey)}<ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <a href={youtubeWatchUrl(video)} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {t('help.watchOnYoutube')}<ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </section>

        <aside aria-labelledby="help-library-title" className="min-w-0">
          <h2 id="help-library-title" className="mb-3 text-sm font-semibold">{t('help.allDemos')}</h2>
          <ul className="border-t border-[var(--ez-border)]">
            {DEMO_VIDEOS.map(item => (
              <li key={item.id} className="border-b border-[var(--ez-border)]">
                <button type="button" aria-pressed={item.id === video.id}
                  onClick={() => {
                    if (item.id === video.id) return;
                    setPlaying(false); setLoading(false); setFailed(false); setVideo(item);
                  }}
                  className={`w-full flex items-start gap-3 p-3 text-left hover:bg-[var(--ez-bg-hover)] ${focusClass} ${item.id === video.id ? 'bg-[var(--ez-accent-soft)]' : ''}`}>
                  <img src={`${process.env.PUBLIC_URL || ''}${item.posterPath}`} alt="" loading="lazy" width={96} height={54}
                    className="w-24 aspect-video object-cover shrink-0 rounded-sm" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold leading-relaxed">{t(item.titleKey)}</span>
                    <span className="block mt-1 text-[11px] text-[var(--ez-text-subtle)] tabular-nums">{formatDemoDuration(item.durationSeconds)} · {t('help.english')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--ez-text-subtle)]">{t('help.playbackHint')}</p>
          <div className="mt-7 border-t border-[var(--ez-border)] pt-4">
            <h2 className="text-sm font-semibold">{t('help.moreHelp')}</h2>
            <ul className="mt-3 space-y-3">
              <li><a href="https://ezpm2gui.vercel.app/userguides/" target="_blank" rel="noopener noreferrer" className={linkClass}>{t('help.userGuide')}<ArrowTopRightOnSquareIcon className="h-3 w-3" aria-hidden="true" /></a></li>
              <li><a href="https://ezpm2gui.vercel.app/" target="_blank" rel="noopener noreferrer" className={linkClass}>{t('help.documentation')}<ArrowTopRightOnSquareIcon className="h-3 w-3" aria-hidden="true" /></a></li>
              <li><Link to="/whats-new" className={linkClass}>{t('help.whatsNew')}</Link></li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Help;

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Dialog, IconButton } from '@mui/material';
import { MagnifyingGlassIcon, XMarkIcon, ArrowTurnDownLeftIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PM2Process } from '../types/pm2';
import './CommandPalette.css';

interface CommandPaletteProps {
  onOpen?: () => void;
  processes?: PM2Process[];
  serverId?: string;
  serverName?: string;
  onProcessAction?: (id: number, action: 'restart' | 'stop') => void;
}

type PaletteCommand =
  | { kind: 'page'; key: string; label: string; searchText: string; path: string }
  | { kind: 'process'; key: string; label: string; searchText: string; process: PM2Process }
  | { kind: 'action'; key: string; label: string; searchText: string; action: 'logs' | 'restart' | 'stop' };

// Mounted inside the unlocked app shell so shortcuts cannot bypass the password gate.
const CommandPalette: React.FC<CommandPaletteProps> = ({ onOpen, processes = [], serverId = 'local', serverName, onProcessAction }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionQuery, setActionQuery] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<{ id: number; name: string } | null>(null);
  const [processUnavailable, setProcessUnavailable] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const shortcut = /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
  const serverLabel = serverName || (serverId === 'local' ? t('nav.localServer') : serverId);
  // A replaced PM2 ID must not inherit the previous process's action menu.
  const selectedProcess = selectedTarget
    ? processes.find(process => process.pm_id === selectedTarget.id && process.name === selectedTarget.name)
    : undefined;
  const query = selectedProcess ? actionQuery : searchQuery;
  const searchLabel = t(selectedProcess ? 'commandPalette.searchActions' : 'commandPalette.search');

  const commands = useMemo(() => [
    { path: '/processes', label: t('nav.processes') },
    { path: '/remote', label: t('nav.remoteServers') },
    { path: '/metrics', label: t('nav.metrics') },
    { path: '/monitoring', label: t('monitoring.title') },
    { path: '/deploy', label: t('nav.deployApp') },
    { path: '/modules', label: t('nav.pm2Modules') },
    { path: '/ecosystem', label: t('nav.ecosystemConfig') },
    { path: '/cluster', label: t('nav.cluster') },
    { path: '/cron-jobs', label: t('nav.cronJobs') },
    { path: '/load-balancing-guide', label: t('nav.loadBalancing') },
    { path: '/logs', label: t('actions.viewLogs') },
    { path: '/settings', label: t('nav.settings') },
    { path: '/help', label: t('nav.help') },
    { path: '/whats-new', label: t('header.whatsNew') },
  ], [t]);
  const processDetails = (process: PM2Process) => [
    `#${process.pm_id}`,
    process.pm2_env?.namespace || 'default',
    t(`status.${process.pm2_env?.status || 'unknown'}`),
  ].join(' · ');
  const searchCommands: PaletteCommand[] = selectedProcess
    ? (['logs', ...(onProcessAction ? ['restart', 'stop'] : [])] as Array<'logs' | 'restart' | 'stop'>).map(action => {
      const label = t(action === 'logs' ? 'actions.viewLogs' : `actions.${action}`);
      return { kind: 'action', key: `action:${action}`, label, searchText: label, action };
    })
    : [
      ...processes.map((process): PaletteCommand => ({
        kind: 'process', key: `process:${process.pm_id}`, label: process.name, process,
        searchText: `${process.name} #${process.pm_id} ${process.pm2_env?.namespace || 'default'}`,
      })),
      ...commands.map((command): PaletteCommand => ({
        ...command, kind: 'page', key: `page:${command.path}`, searchText: `${command.label} ${command.path}`,
      })),
    ];
  const words = query.trim().toLocaleLowerCase().split(/\s+/);
  const results = searchCommands.filter(command => words.every(word =>
    command.searchText.toLocaleLowerCase().includes(word)
  ));
  const selectedIndex = Math.min(activeIndex, Math.max(0, results.length - 1));

  const reset = useCallback(() => {
    setSearchQuery('');
    setActionQuery('');
    setSelectedTarget(null);
    setActiveIndex(0);
    setProcessUnavailable(false);
  }, []);

  const backToSearch = () => {
    setSelectedTarget(null);
    setActionQuery('');
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  useEffect(() => {
    setOpen(false);
    reset();
  }, [serverId, reset]);

  useEffect(() => {
    if (selectedTarget && !selectedProcess) {
      setSelectedTarget(null);
      setActionQuery('');
      setActiveIndex(0);
      setProcessUnavailable(true);
    }
  }, [selectedTarget, selectedProcess]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing) return;
      if (event.key.toLowerCase() !== 'k' && event.code !== 'KeyK') return;
      // Capture before focused inputs, and cancel the browser's location/search shortcut.
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      reset();
      setOpen(previous => !previous);
      onOpen?.();
    };
    window.addEventListener('keydown', handleShortcut, true);
    return () => window.removeEventListener('keydown', handleShortcut, true);
  }, [onOpen, reset]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${selectedIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [id, open, query, selectedIndex, selectedTarget]);

  const choose = (command: PaletteCommand) => {
    if (command.kind === 'process') {
      setSelectedTarget({ id: command.process.pm_id, name: command.process.name });
      setActionQuery('');
      setActiveIndex(0);
      setProcessUnavailable(false);
      return;
    }
    if (command.kind === 'page') {
      setOpen(false);
      navigate(command.path);
    } else if (selectedProcess) {
      setOpen(false);
      if (command.action === 'logs') {
        navigate(serverId === 'local'
          ? `/logs/${selectedProcess.pm_id}`
          : `/logs/remote/${encodeURIComponent(serverId)}/${selectedProcess.pm_id}`);
      } else {
        onProcessAction?.(selectedProcess.pm_id, command.action);
      }
    }
  };

  return <>
    <button
      type="button"
      className="command-palette-trigger"
      aria-label={t('commandPalette.open')}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-keyshortcuts="Meta+K Control+K"
      title={`${t('commandPalette.open')} (${shortcut})`}
      onClick={() => { reset(); setOpen(true); onOpen?.(); }}
    >
      <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
      <kbd aria-hidden="true">{shortcut}</kbd>
    </button>
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (reason === 'escapeKeyDown' && selectedProcess) backToSearch();
        else setOpen(false);
      }}
      aria-labelledby={`${id}-title`}
      maxWidth="sm"
      fullWidth
      PaperProps={{ className: 'command-palette' }}
      TransitionProps={{ onEntered: () => inputRef.current?.focus() }}
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' }, '& .MuiDialog-paper': { marginTop: 'min(15vh, 120px)', marginX: '16px', width: 'calc(100% - 32px)' } }}
    >
      <div className="command-palette-heading">
        <div className="command-palette-heading-main">
          {selectedProcess && <IconButton aria-label={t('commandPalette.back')} onClick={backToSearch}>
            <ArrowLeftIcon className="h-4 w-4" />
          </IconButton>}
          <h2 id={`${id}-title`}>{t('commandPalette.title')}</h2>
        </div>
        <IconButton aria-label={t('actions.close')} onClick={() => setOpen(false)}>
          <XMarkIcon className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="command-palette-context" id={`${id}-context`}>
        {selectedProcess && <>
          <strong>{selectedProcess.name}</strong>
          <span>{processDetails(selectedProcess)}</span>
        </>}
        <span>{t('commandPalette.scope', { server: serverLabel })}</span>
      </div>
      <div className="command-palette-search">
        <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
        <input
          ref={inputRef}
          autoFocus
          role="combobox"
          aria-label={searchLabel}
          aria-describedby={`${id}-context`}
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={`${id}-results`}
          aria-activedescendant={results.length ? `${id}-option-${selectedIndex}` : undefined}
          placeholder={searchLabel}
          value={query}
          onChange={event => {
            if (selectedProcess) setActionQuery(event.target.value);
            else setSearchQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const step = event.key === 'ArrowDown' ? 1 : -1;
              setActiveIndex(results.length ? (selectedIndex + step + results.length) % results.length : 0);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (results[selectedIndex]) choose(results[selectedIndex]);
            }
          }}
        />
      </div>
      {processUnavailable && <p className="command-palette-notice" role="status">{t('commandPalette.processUnavailable')}</p>}
      <div className="command-palette-results" role="listbox" id={`${id}-results`} aria-label={t('commandPalette.results')}>
        {results.map((command, index) => <React.Fragment key={command.key}>
          {command.kind !== 'action' && results[index - 1]?.kind !== command.kind && <div className="command-palette-group-label" role="presentation">
            {t(command.kind === 'process' ? 'nav.processes' : 'commandPalette.pages')}
          </div>}
          <button
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          id={`${id}-option-${index}`}
          tabIndex={-1}
          onMouseDown={event => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => choose(command)}
        >
          <span className="command-palette-option-content">
            <span>{command.label}</span>
            {command.kind === 'process' && <span className="command-palette-option-detail">{processDetails(command.process)}</span>}
          </span>
          {index === selectedIndex && <ArrowTurnDownLeftIcon className="h-4 w-4" aria-hidden="true" />}
        </button></React.Fragment>)}
      </div>
      {results.length === 0 && <p className="command-palette-empty" role="status">{t(selectedProcess ? 'commandPalette.noActions' : 'commandPalette.noResults')}</p>}
      <p className="command-palette-hint">{t(selectedProcess ? 'commandPalette.actionHint' : 'commandPalette.keyboardHint')}</p>
    </Dialog>
  </>;
};

export default CommandPalette;

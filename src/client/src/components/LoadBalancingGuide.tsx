import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

// @group LoadBalancingGuide : PM2 load balancing reference guide
const LoadBalancingGuide: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | false>('panel1');

  const toggle = (panel: string) =>
    setExpanded(prev => (prev === panel ? false : panel));

  // @group Render : CLI-styled static guide with collapsible sections
  return (
    <div className="space-y-3">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#555] mb-1">pm2 / docs</p>
          <h1 className="text-sm font-mono font-bold text-[#e8e8e8]">▸ LOAD BALANCING GUIDE</h1>
          <p className="text-[10px] font-mono text-[#555] mt-0.5">{t('loadBalancing.subtitle')}</p>
        </div>
        <button
          onClick={() => navigate('/cluster')}
          className="border border-[#1e1e1e] text-[#555] font-mono text-xs px-3 py-1 rounded-sm hover:border-[#333] hover:text-[#888]"
        >
          {t('loadBalancing.goToCluster')}
        </button>
      </div>

      {/* Section: What is Load Balancing */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-sm overflow-hidden">
        <button
          onClick={() => toggle('panel1')}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-[11px] font-mono font-bold text-[#e8e8e8] uppercase tracking-[0.05em]">
            {t('loadBalancing.whatIsTitle')}
          </span>
          <span className="text-[#555] font-mono text-xs">{expanded === 'panel1' ? '▾' : '▸'}</span>
        </button>
        {expanded === 'panel1' && (
          <div className="px-4 pb-4 border-t border-[#1e1e1e]">
            <p className="text-[10px] font-mono text-[#888] leading-relaxed mt-3 mb-3">
              {t('loadBalancing.whatIsDesc')}
            </p>
            <ul className="space-y-1.5">
              {[
                { symbol: '▸', text: t('loadBalancing.benefit1'), color: 'text-[#22c55e]' },
                { symbol: '▸', text: t('loadBalancing.benefit2'), color: 'text-[#22d3ee]' },
                { symbol: '▸', text: t('loadBalancing.benefit3'), color: 'text-[#a78bfa]' },
              ].map(({ symbol, text, color }) => (
                <li key={text} className="flex items-start gap-2">
                  <span className={`text-[9px] font-mono mt-0.5 ${color}`}>{symbol}</span>
                  <span className="text-[10px] font-mono text-[#888] leading-relaxed">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Section: Setting Up */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-sm overflow-hidden">
        <button
          onClick={() => toggle('panel2')}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-[11px] font-mono font-bold text-[#e8e8e8] uppercase tracking-[0.05em]">
            {t('loadBalancing.settingUpTitle')}
          </span>
          <span className="text-[#555] font-mono text-xs">{expanded === 'panel2' ? '▾' : '▸'}</span>
        </button>
        {expanded === 'panel2' && (
          <div className="px-4 pb-4 border-t border-[#1e1e1e]">
            <p className="text-[10px] font-mono text-[#888] leading-relaxed mt-3 mb-3">
              {t('loadBalancing.settingUpDesc')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  title: t('loadBalancing.multipleInstances'),
                  desc: 'Set instances > 1 to create workers. Use -1 to match CPU core count.',
                  code: '"instances": 4  // or -1 for max',
                },
                {
                  title: t('loadBalancing.clusterMode'),
                  desc: 'Allow all instances to share the same server port.',
                  code: '"exec_mode": "cluster"',
                },
              ].map(({ title, desc, code }) => (
                <div key={title} className="bg-[#141414] border border-[#1e1e1e] rounded-sm p-3">
                  <p className="text-[11px] font-mono font-bold text-[#e8e8e8] uppercase tracking-[0.05em] mb-1">{title}</p>
                  <p className="text-[10px] font-mono text-[#888] leading-relaxed mb-2">{desc}</p>
                  <pre className="bg-[#0a0a0a] border border-[#1e1e1e] font-mono text-[10px] text-[#22d3ee] p-3 rounded-sm whitespace-pre-wrap">
                    {code}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section: Best Practices */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-sm overflow-hidden">
        <button
          onClick={() => toggle('panel3')}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-[11px] font-mono font-bold text-[#e8e8e8] uppercase tracking-[0.05em]">
            {t('loadBalancing.bestPractices')}
          </span>
          <span className="text-[#555] font-mono text-xs">{expanded === 'panel3' ? '▾' : '▸'}</span>
        </button>
        {expanded === 'panel3' && (
          <div className="px-4 pb-4 border-t border-[#1e1e1e]">
            <ul className="space-y-3 mt-3">
              {[
                {
                  primary: 'Instances',
                  secondary: 'Match CPU cores for CPU-bound apps. I/O-bound apps can use more.',
                },
                {
                  primary: 'Stateless Design',
                  secondary: 'Keep app stateless or use Redis for shared session storage.',
                },
                {
                  primary: 'Memory Limits',
                  secondary: 'Set max_memory_restart to automatically cycle processes with leaks.',
                },
                {
                  primary: 'Zero-downtime',
                  secondary: 'Use pm2 reload (not restart) to update without dropping connections.',
                },
              ].map(({ primary, secondary }) => (
                <li key={primary} className="flex items-start gap-3">
                  <span className="text-[9px] font-mono text-[#f59e0b] mt-0.5">▸</span>
                  <div>
                    <p className="text-[10px] font-mono font-bold text-[#e8e8e8]">{primary}</p>
                    <p className="text-[10px] font-mono text-[#888] leading-relaxed">{secondary}</p>
                  </div>
                </li>
              ))}
            </ul>

            {/* Tip callout */}
            <div className="bg-[#1a0e00] border border-[#f59e0b]/20 rounded-sm p-3 mt-4">
              <p className="text-[10px] font-mono text-[#f59e0b] leading-relaxed">
                Tip: Use <span className="text-[#e8e8e8]">pm2 reload</span> for zero-downtime deployments in cluster mode. This gracefully cycles workers one at a time, keeping your service online.
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default LoadBalancingGuide;

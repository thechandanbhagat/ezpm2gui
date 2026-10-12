import React from 'react';

// @group Types : PageHeader component props
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

// @group PageHeader : Shared compact CLI page header — title, optional subtitle, optional action buttons
const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-[#1e1e1e]">
    <div className="min-w-0">
      <h1 className="text-xl font-mono font-bold text-[#e8e8e8] uppercase tracking-[0.05em] leading-snug">
        ▸ {title}
      </h1>
      {subtitle && (
        <p className="text-[10px] font-mono text-[#555] mt-0.5">{subtitle}</p>
      )}
    </div>
    {actions && (
      <div className="flex items-center gap-2 shrink-0">
        {actions}
      </div>
    )}
  </div>
);

export default PageHeader;

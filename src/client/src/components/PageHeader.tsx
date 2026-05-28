import React from 'react';

// @group Types : PageHeader component props
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

// @group PageHeader : Shared compact CLI page header — title, optional subtitle, optional action buttons
const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => (
  <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1e1e1e]">
    <div>
      <h1 className="text-[11px] font-mono font-bold text-[#e8e8e8] uppercase tracking-[0.1em] leading-tight">
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

import React from 'react';

// @group Types : PageHeader component props
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

// @group PageHeader : Shared compact page header — title, optional subtitle, optional action buttons
const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => (
  <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-200 dark:border-neutral-800">
    <div>
      <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 leading-tight">
        {title}
      </h1>
      {subtitle && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{subtitle}</p>
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

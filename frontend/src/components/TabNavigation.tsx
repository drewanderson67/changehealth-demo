import React from 'react';

export type TabType = 'eligibility' | 'claim-form' | 'claims-status' | 'claims-reconciliation';

interface Props {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  variant: 'desktop' | 'mobile';
}

const iconPaths: Record<TabType, string> = {
  'eligibility': 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  'claim-form': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  'claims-status': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  'claims-reconciliation': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
};

const tabs: { id: TabType; label: string; shortLabel: string }[] = [
  { id: 'eligibility', label: 'Eligibility Checker', shortLabel: 'Eligibility' },
  { id: 'claim-form', label: 'Claim Form', shortLabel: 'Claim' },
  { id: 'claims-status', label: 'Claims Status', shortLabel: 'Status' },
  { id: 'claims-reconciliation', label: 'Claims Reconciliation', shortLabel: 'Reconcile' },
];

function TabIcon({ id, className }: { id: TabType; className: string }): React.ReactElement {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPaths[id]} />
    </svg>
  );
}

export default function TabNavigation({ activeTab, onTabChange, variant }: Props) {
  if (variant === 'desktop') {
    return (
      <nav className="hidden md:flex gap-1 p-1 rounded-xl bg-slate-100/80 ring-1 ring-slate-200" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium whitespace-nowrap rounded-lg transition-all ${
                isActive
                  ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <TabIcon id={tab.id} className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white/90 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]"
        aria-label="Tabs"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                isActive ? 'text-brand-600' : 'text-slate-500'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={`flex items-center justify-center w-12 h-7 rounded-full transition-colors ${isActive ? 'bg-brand-50' : ''}`}>
                <TabIcon id={tab.id} className="w-5 h-5" />
              </span>
              {tab.shortLabel}
            </button>
          );
        })}
      </nav>
  );
}

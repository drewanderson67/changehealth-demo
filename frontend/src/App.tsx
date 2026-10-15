import { useState, useEffect } from 'react';
import TabNavigation, { type TabType } from './components/TabNavigation';
import EligibilityChecker from './components/EligibilityChecker';
import ClaimForm from './components/ClaimForm';
import ClaimsStatus from './components/ClaimsStatus';
import ClaimsReconciliation from './components/ClaimsReconciliation';
import type { Environment } from './types/eligibility';
import { getBackendStatus } from './services/api';

const STORAGE_KEY_ENVIRONMENT = 'optum-eligibility-environment';
const STORAGE_KEY_ACTIVE_TAB = 'optum-active-tab';

export default function App() {
  // Load active tab from localStorage or default to eligibility
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_TAB);
    return (saved === 'eligibility' || saved === 'claim-form' || saved === 'claims-status' || saved === 'claims-reconciliation')
      ? saved as TabType
      : 'eligibility';
  });

  // Load environment from localStorage or default to sandbox
  const [environment, setEnvironment] = useState<Environment>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ENVIRONMENT);
    return (saved === 'production' || saved === 'sandbox') ? saved : 'sandbox';
  });

  const [mockMode, setMockMode] = useState(false);

  useEffect(() => {
    getBackendStatus()
      .then(status => setMockMode(status.mock))
      .catch(() => setMockMode(false));
  }, []);

  // Persist environment to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ENVIRONMENT, environment);
  }, [environment]);

  // Persist active tab to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, activeTab);
  }, [activeTab]);

  const handleEnvironmentChange = (env: Environment) => {
    setEnvironment(env);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  // Render the active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'eligibility':
        return (
          <EligibilityChecker
            environment={environment}
            onEnvironmentChange={handleEnvironmentChange}
          />
        );
      case 'claim-form':
        return (
          <ClaimForm
            environment={environment}
            onEnvironmentChange={handleEnvironmentChange}
          />
        );
      case 'claims-status':
        return (
          <ClaimsStatus
            environment={environment}
          />
        );
      case 'claims-reconciliation':
        return (
          <ClaimsReconciliation
            environment={environment}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-lg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="w-9 h-9 rounded-xl shadow-sm" />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 leading-tight">
                ChangeHealth
              </h1>
              <p className="text-xs text-slate-500 leading-tight truncate">Optum API tools · eligibility &amp; claims</p>
            </div>
          </div>
          <TabNavigation variant="desktop" activeTab={activeTab} onTabChange={handleTabChange} />
          <div className="ml-auto flex items-center gap-2">
            {mockMode && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                title="No Optum credentials are configured (or OPTUM_MOCK_MODE=true), so responses are simulated"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                <span className="sm:hidden">Mock</span>
                <span className="hidden sm:inline">Mock mode: simulated Optum responses</span>
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 sm:px-6 py-4 sm:py-6 pb-28 md:pb-10">
        {renderTabContent()}
        <p className="mt-8 text-center text-xs text-slate-400">Build {__APP_VERSION__}</p>
      </main>

      <TabNavigation variant="mobile" activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}

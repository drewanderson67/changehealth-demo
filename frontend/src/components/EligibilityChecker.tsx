import { useState } from 'react';
import EnvironmentSelector from './EnvironmentSelector';
import EligibilityForm from './EligibilityForm';
import ResponseDisplay from './ResponseDisplay';
import ApiResponseModal from './ApiResponseModal';
import { checkEligibility } from '../services/api';
import type { EligibilityRequest, EligibilityResponse, Environment } from '../types/eligibility';

interface Props {
  environment: Environment;
  onEnvironmentChange: (env: Environment) => void;
}

export default function EligibilityChecker({
  environment,
  onEnvironmentChange
}: Props) {
  const [loading, setLoading] = useState(false);
  const [lastRequest, setLastRequest] = useState<EligibilityRequest | null>(null);
  const [response, setResponse] = useState<EligibilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attemptLogs, setAttemptLogs] = useState<Array<{
    payerId: string;
    timestamp: string;
    status: 'trying' | 'success' | 'failed';
    error?: string;
    request?: EligibilityRequest;
    response?: EligibilityResponse;
  }>>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [selectedLogIndex, setSelectedLogIndex] = useState<number | null>(null);

  const handleSubmit = async (data: EligibilityRequest, alternatePayerIds?: string[]) => {
    setLoading(true);
    setError(null);
    setResponse(null);
    setLastRequest(data);
    setAttemptLogs([]);

    // Try alternate IDs in reverse order first (last to first), then primary
    const reversedAlternates = [...(alternatePayerIds || [])].reverse();
    const payerIdsToTry = [...reversedAlternates, data.tradingPartnerServiceId];
    let lastError: Error | null = null;

    for (const payerId of payerIdsToTry) {
      if (!payerId) continue;
      
      const timestamp = new Date().toLocaleTimeString();
      
      // Log attempt start
      setAttemptLogs(prev => [...prev, {
        payerId,
        timestamp,
        status: 'trying',
        request: requestWithPayerId
      }]);
      
      const requestWithPayerId = {
        ...data,
        tradingPartnerServiceId: payerId
      };

      try {
        console.log(`Trying payer ID: ${payerId}`);
        const result = await checkEligibility(requestWithPayerId, environment);
        
        // Check if response has AAA errors (T4, etc.) - treat as failure and try next ID
        if (result.errors && result.errors.length > 0) {
          const errorMsg = result.errors.map((e) => `${e.code}: ${e.description}`).join(', ');
          console.log(`✗ Response has errors with payer ID: ${payerId}`, errorMsg);
          
          // Log failure with response
          setAttemptLogs(prev => prev.map(log => 
            log.payerId === payerId && log.timestamp === timestamp
              ? { ...log, status: 'failed' as const, error: errorMsg, response: result }
              : log
          ));
          
          lastError = new Error(errorMsg);
          continue; // Try next payer ID
        }
        
        console.log(`✓ Success with payer ID: ${payerId}`);
        
        // Log success with response
        setAttemptLogs(prev => prev.map(log => 
          log.payerId === payerId && log.timestamp === timestamp
            ? { ...log, status: 'success' as const, response: result }
            : log
        ));
        
        setResponse(result);
        setLastRequest(requestWithPayerId);
        setLoading(false);
        return;
      } catch (caught) {
        const err = caught instanceof Error ? caught : new Error(String(caught));
        console.log(`✗ Failed with payer ID: ${payerId}`, err.message);
        lastError = err;
        
        // Log failure (network/API error)
        setAttemptLogs(prev => prev.map(log => 
          log.payerId === payerId && log.timestamp === timestamp
            ? { ...log, status: 'failed' as const, error: err.message, response: (caught as { response?: EligibilityResponse }).response }
            : log
        ));
      }
    }

    // All attempts failed
    setError(lastError?.message || 'All payer IDs failed');
    setLoading(false);
  };

  const handleEnvironmentChange = (env: Environment) => {
    onEnvironmentChange(env);
    // Clear response when switching environments
    setLastRequest(null);
    setResponse(null);
    setError(null);
  };

  const emptyPanel = 'rounded-2xl border-2 border-dashed border-slate-300 bg-slate-100/60 min-h-64 lg:min-h-[28rem] flex items-center justify-center p-6';

  return (
    <div className={`grid gap-6 items-start ${showLogs ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)]' : 'lg:grid-cols-2'}`}>
      {/* Form */}
      <div className="min-w-0">
        <EnvironmentSelector
          environment={environment}
          onEnvironmentChange={handleEnvironmentChange}
        />
        <EligibilityForm
          onSubmit={handleSubmit}
          loading={loading}
          environment={environment}
        />
      </div>

      {/* Results */}
      <div className="min-w-0">
        {loading ? (
          <div className={emptyPanel}>
            <div className="text-center text-slate-500 space-y-4">
              <svg className="mx-auto animate-spin h-10 w-10 text-brand-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-base font-medium text-slate-700">Checking eligibility...</p>
            </div>
          </div>
        ) : (response || error) ? (
          <div className="card overflow-hidden">
            <ResponseDisplay request={lastRequest} response={response} error={error} />
          </div>
        ) : (
          <div className={emptyPanel}>
            <div className="text-center text-slate-500">
              <svg className="mx-auto h-10 w-10 text-slate-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-base font-medium">Eligibility results will appear here</p>
              <p className="text-sm mt-1">Fill out the form and click "Check Eligibility" to get started</p>
            </div>
          </div>
        )}
      </div>

      {/* Attempt Log */}
      {showLogs ? (
        <div className="card min-w-0 flex flex-col max-h-80 lg:max-h-[calc(100vh-12rem)] lg:sticky lg:top-24">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm text-slate-800">Attempt Log</h3>
            <button
              onClick={() => setShowLogs(false)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Hide
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs font-mono">
            {attemptLogs.length === 0 ? (
              <div className="text-slate-400 p-1">No attempts yet</div>
            ) : (
              attemptLogs.map((log, index) => (
                <div
                  key={index}
                  className={`p-2 rounded-lg border ${
                    log.status === 'success' ? 'bg-emerald-50 border-emerald-200' :
                    log.status === 'failed' ? 'bg-red-50 border-red-200' :
                    'bg-amber-50 border-amber-200'
                  }`}
                >
                  <div className="font-semibold">
                    {log.status === 'success' ? '✓' : log.status === 'failed' ? '✗' : '⋯'} {log.payerId}
                  </div>
                  <div className="text-slate-500">{log.timestamp}</div>
                  {log.error && (
                    <div className="text-red-600 text-[10px] mt-1 wrap-break-word">
                      {log.error.substring(0, 100)}
                    </div>
                  )}
                  {(log.request || log.response) && (
                    <button
                      onClick={() => setSelectedLogIndex(index)}
                      className="mt-1 text-brand-600 hover:text-brand-800 underline text-[10px]"
                    >
                      View Details
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowLogs(true)}
          className="lg:col-span-2 justify-self-end text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-full px-3 py-1.5"
        >
          Show attempt log
        </button>
      )}

      {/* Attempt Log Detail Modal */}
      {selectedLogIndex !== null && attemptLogs[selectedLogIndex] && (
        <ApiResponseModal
          isOpen={true}
          onClose={() => setSelectedLogIndex(null)}
          title={`Attempt: ${attemptLogs[selectedLogIndex].payerId}`}
          request={{
            endpoint: '/api/eligibility/check-eligibility',
            method: 'POST',
            body: attemptLogs[selectedLogIndex].request
          }}
          response={attemptLogs[selectedLogIndex].response}
          error={attemptLogs[selectedLogIndex].error}
        />
      )}
    </div>
  );
}



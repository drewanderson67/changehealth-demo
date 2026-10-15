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

  return (
    <div className="flex gap-6 lg:h-[calc(100vh-200px)] relative">
      {/* Left Column - Form */}
      <div className="flex-shrink-0 lg:w-1/2 xl:w-2/5 flex flex-col" style={{ width: showLogs ? '40%' : '50%' }}>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 flex-1 overflow-y-auto">
          <EnvironmentSelector 
            environment={environment} 
            onEnvironmentChange={handleEnvironmentChange} 
          />
          <div className="mt-6">
            <EligibilityForm
              onSubmit={handleSubmit}
              loading={loading}
              environment={environment}
            />
          </div>
        </div>
      </div>

      {/* Middle Column - Results */}
      <div className="flex-1 flex flex-col min-h-0" style={{ width: showLogs ? '40%' : '50%' }}>
        {loading ? (
          <div className="bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500 space-y-4">
              <div className="flex justify-center">
                <svg className="animate-spin h-12 w-12 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium text-gray-700">Checking eligibility...</p>
                <p className="text-sm text-gray-500">Eligibility results will appear here</p>
              </div>
            </div>
          </div>
        ) : (response || error) ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 overflow-y-auto">
            <ResponseDisplay request={lastRequest} response={response} error={error} />
          </div>
        ) : (
          <div className="bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium">Eligibility results will appear here</p>
              <p className="text-sm mt-2">Fill out the form and click "Check Eligibility" to get started</p>
            </div>
          </div>
        )}
      </div>

      {/* Right Column - Attempt Logs */}
      <div 
        className={`flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 transition-all duration-300 ${
          showLogs ? 'w-[20%]' : 'w-0 overflow-hidden'
        }`}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-sm">Attempt Log</h3>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="text-xs text-gray-600 hover:text-gray-800"
          >
            {showLogs ? 'Hide' : 'Show'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs font-mono">
          {attemptLogs.length === 0 ? (
            <div className="text-gray-400">No attempts yet</div>
          ) : (
            attemptLogs.map((log, index) => (
              <div 
                key={index}
                className={`p-2 rounded border ${
                  log.status === 'success' ? 'bg-green-50 border-green-300' :
                  log.status === 'failed' ? 'bg-red-50 border-red-300' :
                  'bg-yellow-50 border-yellow-300'
                }`}
              >
                <div className="font-semibold">
                  {log.status === 'success' ? '✓' : log.status === 'failed' ? '✗' : '⋯'} {log.payerId}
                </div>
                <div className="text-gray-500">{log.timestamp}</div>
                {log.error && (
                  <div className="text-red-600 text-[10px] mt-1 break-words">
                    {log.error.substring(0, 100)}
                  </div>
                )}
                {(log.request || log.response) && (
                  <button
                    onClick={() => setSelectedLogIndex(index)}
                    className="mt-1 text-blue-600 hover:text-blue-800 underline text-[10px]"
                  >
                    View Details
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Slideout Toggle Button */}
      {!showLogs && (
        <button
          onClick={() => setShowLogs(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-2 py-8 rounded-l-lg shadow-lg hover:bg-blue-700 text-xs"
          style={{ writingMode: 'vertical-rl' }}
        >
          Show Logs
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



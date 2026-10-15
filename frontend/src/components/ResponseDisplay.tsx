import { useState } from 'react';
import type { EligibilityResponse, EligibilityRequest } from '../types/eligibility';
import ApiResponseModal from './ApiResponseModal';
import EligibilityDetails from './EligibilityDetails';

interface Props {
  request: EligibilityRequest | null;
  response: EligibilityResponse | null;
  error: string | null;
}

export default function ResponseDisplay({ request, response, error }: Props) {
  const [showModal, setShowModal] = useState(false);
  if (error) {
    // Try to parse error as JSON for better display
    let errorObj;
    let displayMessage = error;
    try {
      errorObj = JSON.parse(error);
      displayMessage = errorObj.message || error;
    } catch {
      // Not JSON, use as-is
      errorObj = null;
    }

    return (
      <>
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Summary Section */}
          <div className="p-6 bg-red-50 border border-red-200 rounded-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-red-800 font-semibold text-lg">Error</h3>
              <button
                onClick={() => setShowModal(true)}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                View API Request/Response
              </button>
            </div>
            <p className="text-red-600">{displayMessage}</p>
          </div>
        </div>

        <ApiResponseModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title="Eligibility Check API Request/Response"
          request={request ? {
            endpoint: `/api/eligibility/check-eligibility`,
            method: 'POST',
            body: request
          } : undefined}
          error={errorObj ? JSON.stringify(errorObj, null, 2) : error || undefined}
        />
      </>
    );
  }

  if (!response) return null;

  return (
    <>
      <div className="p-6 space-y-4">
        {/* Summary Header */}
        <div className="bg-green-50 border border-green-200 rounded-lg shadow-xs p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-lg font-bold text-green-800">Eligibility Verification Complete</h3>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Control Number: {response.controlNumber || response.meta?.traceId || 'N/A'}
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-1.5 text-xs sm:text-sm bg-blue-600 text-white rounded-sm hover:bg-blue-700 whitespace-nowrap"
            >
              View Raw JSON
            </button>
          </div>
          {response.errors && response.errors.length > 0 && (
            <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded-sm">
              <p className="text-xs sm:text-sm font-medium text-red-800">
                {response.errors.length} error(s) found - see details below
              </p>
            </div>
          )}
        </div>

        {/* Detailed Eligibility Information */}
        <EligibilityDetails response={response} />
      </div>

      <ApiResponseModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Eligibility Check API Request/Response"
        request={request ? {
          endpoint: `/api/eligibility/check-eligibility`,
          method: 'POST',
          body: request
        } : undefined}
        response={response || undefined}
        error={error || undefined}
      />
    </>
  );
}


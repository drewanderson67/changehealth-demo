import { useState } from 'react';
import type { ClaimResponse, ClaimSubmissionRequest } from '../types/claims';
import ApiResponseModal from './ApiResponseModal';

interface Props {
  request: ClaimSubmissionRequest | null;
  response: ClaimResponse | null;
  error: string | null;
  requestEndpoint: string;
  onGeneratePDF?: () => void;
}

export default function ClaimResponseDisplay({ request, response, error, requestEndpoint, onGeneratePDF }: Props) {
  const [showModal, setShowModal] = useState(false);

  if (error) {
    let errorObj;
    let displayMessage = error;
    try {
      errorObj = JSON.parse(error);
      displayMessage = errorObj.message || error;
    } catch {
      errorObj = null;
    }

    return (
      <>
        <div className="p-6 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
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
            {errorObj?.details && (
              <div className="mt-3 p-3 bg-white rounded border border-red-300">
                <pre className="text-xs overflow-auto">{JSON.stringify(errorObj.details, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>

        <ApiResponseModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title="Optum Claim API Request/Response"
          request={request ? {
            endpoint: requestEndpoint,
            method: 'POST',
            body: request
          } : undefined}
          error={errorObj ? JSON.stringify(errorObj, null, 2) : error || undefined}
        />
      </>
    );
  }

  if (!response) return null;

  const isSuccess = response.status === 'SUCCESS';
  const hasErrors = response.errors && response.errors.length > 0;
  const hasEditResponses = response.editResponses && response.editResponses.length > 0;

  return (
    <>
      <div className="p-6 space-y-4">
        {/* Summary Header */}
        <div className={`border rounded-lg p-4 ${isSuccess ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
            <div>
              <h3 className={`text-lg font-bold ${isSuccess ? 'text-green-800' : 'text-yellow-800'}`}>
                {isSuccess ? 'Claim Processed Successfully' : 'Claim Processed with Warnings'}
              </h3>
              <div className="text-xs sm:text-sm text-gray-600 mt-1 space-y-1">
                {(response.claimReference?.rhclaimNumber || response.claimReference?.rhClaimNumber) && (
                  <p>
                    Optum Clearinghouse Tracking Number:{' '}
                    {response.claimReference.rhclaimNumber || response.claimReference.rhClaimNumber}
                  </p>
                )}
                {response.claimReference?.correlationId && (
                  <p>Correlation ID: {response.claimReference.correlationId}</p>
                )}
                {response.claimReference?.customerClaimNumber && (
                  <p>Claim Number: {response.claimReference.customerClaimNumber}</p>
                )}
                {response.claimReference?.patientControlNumber && (
                  <p>Patient Control Number: {response.claimReference.patientControlNumber}</p>
                )}
                {response.controlNumber && (
                  <p>Control Number: {response.controlNumber}</p>
                )}
                {response.meta?.traceId && (
                  <p>Trace ID: {response.meta.traceId}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {onGeneratePDF && (
                <button
                  onClick={onGeneratePDF}
                  className="px-3 py-1.5 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap"
                >
                  Download PDF
                </button>
              )}
              <button
                onClick={() => setShowModal(true)}
                className="px-3 py-1.5 text-xs sm:text-sm bg-gray-600 text-white rounded hover:bg-gray-700 whitespace-nowrap"
              >
                View Raw JSON
              </button>
            </div>
          </div>
          
          {hasErrors && (
            <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded">
              <p className="text-xs sm:text-sm font-medium text-red-800">
                ⚠️ {response.errors!.length} error(s) found - see details below
              </p>
            </div>
          )}
          
          {hasEditResponses && (
            <div className="mt-3 p-2 bg-yellow-100 border border-yellow-300 rounded">
              <p className="text-xs sm:text-sm font-medium text-yellow-800">
                ⚠️ {response.editResponses!.length} edit response(s) found - see details below
              </p>
            </div>
          )}
        </div>

        {/* Payer Information */}
        {response.payer && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-2">Payer Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {response.payer.payerName && (
                <div>
                  <span className="font-medium text-gray-700">Payer Name:</span>{' '}
                  <span className="text-gray-900">{response.payer.payerName}</span>
                </div>
              )}
              {response.payer.payerID && (
                <div>
                  <span className="font-medium text-gray-700">Payer ID:</span>{' '}
                  <span className="text-gray-900">{response.payer.payerID}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Errors */}
        {hasErrors && (
          <div className="bg-white border border-red-200 rounded-lg p-4">
            <h4 className="font-semibold text-red-800 mb-3">Errors</h4>
            <div className="space-y-3">
              {response.errors!.map((err, index) => (
                <div key={index} className="border border-red-200 rounded p-3 bg-red-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    {err.field && (
                      <div>
                        <span className="font-medium text-gray-700">Field:</span>{' '}
                        <span className="text-gray-900">{err.field}</span>
                      </div>
                    )}
                    {err.code && (
                      <div>
                        <span className="font-medium text-gray-700">Code:</span>{' '}
                        <span className="text-gray-900">{err.code}</span>
                      </div>
                    )}
                    {err.value && (
                      <div>
                        <span className="font-medium text-gray-700">Value:</span>{' '}
                        <span className="text-gray-900">{err.value}</span>
                      </div>
                    )}
                    {err.location && (
                      <div>
                        <span className="font-medium text-gray-700">Location:</span>{' '}
                        <span className="text-gray-900">{err.location}</span>
                      </div>
                    )}
                  </div>
                  {err.description && (
                    <div className="mt-2">
                      <span className="font-medium text-gray-700">Description:</span>{' '}
                      <span className="text-red-700">{err.description}</span>
                    </div>
                  )}
                  {err.followupAction && (
                    <div className="mt-2">
                      <span className="font-medium text-gray-700">Follow-up Action:</span>{' '}
                      <span className="text-gray-900">{err.followupAction}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Edit Responses */}
        {hasEditResponses && (
          <div className="bg-white border border-yellow-200 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-800 mb-3">Edit Responses</h4>
            <div className="space-y-3">
              {response.editResponses!.map((edit, index) => (
                <div key={index} className="border border-yellow-200 rounded p-3 bg-yellow-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    {edit.editName && (
                      <div>
                        <span className="font-medium text-gray-700">Edit Name:</span>{' '}
                        <span className="text-gray-900">{edit.editName}</span>
                      </div>
                    )}
                    {edit.editActivity && (
                      <div>
                        <span className="font-medium text-gray-700">Edit Activity:</span>{' '}
                        <span className="text-gray-900">{edit.editActivity}</span>
                      </div>
                    )}
                    {edit.phaseID && (
                      <div>
                        <span className="font-medium text-gray-700">Phase ID:</span>{' '}
                        <span className="text-gray-900">{edit.phaseID}</span>
                      </div>
                    )}
                    {edit.referenceID && (
                      <div>
                        <span className="font-medium text-gray-700">Reference ID:</span>{' '}
                        <span className="text-gray-900">{edit.referenceID}</span>
                      </div>
                    )}
                    {edit.segment && (
                      <div>
                        <span className="font-medium text-gray-700">Segment:</span>{' '}
                        <span className="text-gray-900">{edit.segment}</span>
                      </div>
                    )}
                    {edit.element && (
                      <div>
                        <span className="font-medium text-gray-700">Element:</span>{' '}
                        <span className="text-gray-900">{edit.element}</span>
                      </div>
                    )}
                  </div>
                  {edit.errorDescription && (
                    <div className="mt-2">
                      <span className="font-medium text-gray-700">Error Description:</span>{' '}
                      <span className="text-yellow-700">{edit.errorDescription}</span>
                    </div>
                  )}
                  {edit.badData && (
                    <div className="mt-2">
                      <span className="font-medium text-gray-700">Bad Data:</span>{' '}
                      <span className="text-gray-900">{edit.badData}</span>
                    </div>
                  )}
                  {edit.allowOverride && (
                    <div className="mt-2">
                      <span className="font-medium text-gray-700">Allow Override:</span>{' '}
                      <span className="text-gray-900">{edit.allowOverride}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Failure */}
        {response.failure && (
          <div className="bg-white border border-red-200 rounded-lg p-4">
            <h4 className="font-semibold text-red-800 mb-2">Failure</h4>
            <div className="text-sm">
              {response.failure.code && (
                <div className="mb-2">
                  <span className="font-medium text-gray-700">Code:</span>{' '}
                  <span className="text-gray-900">{response.failure.code}</span>
                </div>
              )}
              {response.failure.description && (
                <div>
                  <span className="font-medium text-gray-700">Description:</span>{' '}
                  <span className="text-red-700">{response.failure.description}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Meta Information */}
        {response.meta && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-2">Meta Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {response.meta.submitterId && (
                <div>
                  <span className="font-medium text-gray-700">Submitter ID:</span>{' '}
                  <span className="text-gray-900">{response.meta.submitterId}</span>
                </div>
              )}
              {response.meta.senderId && (
                <div>
                  <span className="font-medium text-gray-700">Sender ID:</span>{' '}
                  <span className="text-gray-900">{response.meta.senderId}</span>
                </div>
              )}
              {response.meta.billerId && (
                <div>
                  <span className="font-medium text-gray-700">Biller ID:</span>{' '}
                  <span className="text-gray-900">{response.meta.billerId}</span>
                </div>
              )}
              {response.meta.traceId && (
                <div>
                  <span className="font-medium text-gray-700">Trace ID:</span>{' '}
                  <span className="text-gray-900">{response.meta.traceId}</span>
                </div>
              )}
              {response.meta.applicationMode && (
                <div>
                  <span className="font-medium text-gray-700">Application Mode:</span>{' '}
                  <span className="text-gray-900">{response.meta.applicationMode}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ApiResponseModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Optum Claim API Request/Response"
        request={request ? {
          endpoint: requestEndpoint,
          method: 'POST',
          body: request
        } : undefined}
        response={response || undefined}
        error={error || undefined}
      />
    </>
  );
}

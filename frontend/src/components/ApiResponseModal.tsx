import { useEffect } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  request?: unknown;
  response?: unknown;
  error?: string | null;
}

export default function ApiResponseModal({ isOpen, onClose, title, request, response, error }: Props) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard!`);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Request Section */}
          {request !== undefined && request !== null && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-blue-700">Request</h3>
                <button
                  onClick={() => copyToClipboard(JSON.stringify(request, null, 2), 'Request')}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Copy Request
                </button>
              </div>
              <div className="bg-gray-900 text-blue-400 p-4 rounded overflow-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(request, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Response Section */}
          {response !== undefined && response !== null && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-green-700">Response</h3>
                <button
                  onClick={() => copyToClipboard(JSON.stringify(response, null, 2), 'Response')}
                  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Copy Response
                </button>
              </div>
              <div className="bg-gray-900 text-green-400 p-4 rounded overflow-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {JSON.stringify(response, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Error Section */}
          {error && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-red-700">Error</h3>
                <button
                  onClick={() => copyToClipboard(error, 'Error')}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Copy Error
                </button>
              </div>
              <div className="bg-gray-900 text-red-400 p-4 rounded overflow-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {error}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

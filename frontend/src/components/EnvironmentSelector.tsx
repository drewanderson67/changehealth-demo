import type { Environment } from '../types/eligibility';

interface Props {
  environment: Environment;
  onEnvironmentChange: (env: Environment) => void;
}

export default function EnvironmentSelector({ environment, onEnvironmentChange }: Props) {
  const baseUrl = environment === 'sandbox' 
    ? 'https://sandbox-apigw.optum.com' 
    : 'https://apigw.optum.com';

  return (
    <div className="max-w-2xl mx-auto p-4 bg-yellow-50 border border-yellow-300 rounded-sm mb-6">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-800">Environment</h3>
          <p className="text-sm text-gray-600">
            {environment === 'sandbox' 
              ? 'Using test data (sandbox)' 
              : 'Using live data (production)'}
          </p>
          <p className="text-xs text-gray-500 mt-1 font-mono">
            API: {baseUrl}
          </p>
        </div>
        <select
          value={environment}
          onChange={(e) => onEnvironmentChange(e.target.value as Environment)}
          className="px-4 py-2 border border-gray-300 rounded-lg bg-white font-medium text-gray-800 cursor-pointer hover:bg-gray-50"
        >
          <option value="sandbox">Sandbox (Test)</option>
          <option value="production">Production (Live)</option>
        </select>
      </div>
      {environment === 'production' && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-sm">
          <p className="text-xs text-red-700 font-semibold">
            ⚠️ WARNING: You are using PRODUCTION mode with real data and may incur costs.
          </p>
        </div>
      )}
    </div>
  );
}


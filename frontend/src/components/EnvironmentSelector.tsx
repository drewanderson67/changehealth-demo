import type { Environment } from '../types/eligibility';

interface Props {
  environment: Environment;
  onEnvironmentChange: (env: Environment) => void;
}

export default function EnvironmentSelector({ environment, onEnvironmentChange }: Props) {
  const isProduction = environment === 'production';
  const baseUrl = isProduction ? 'https://apigw.optum.com' : 'https://sandbox-apigw.optum.com';

  return (
    <div className={`card mb-6 p-4 ${isProduction ? 'ring-red-300 bg-red-50/60' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isProduction ? 'bg-red-500' : 'bg-emerald-500'}`} aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-800">Environment</h3>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {isProduction ? 'Using live data (production)' : 'Using test data (sandbox)'}
          </p>
          <p className="text-xs text-slate-400 mt-1 font-mono truncate">API: {baseUrl}</p>
        </div>
        <div className="inline-flex p-1 rounded-lg bg-slate-100 ring-1 ring-slate-200" role="radiogroup" aria-label="Environment">
          {(['sandbox', 'production'] as const).map(env => (
            <button
              key={env}
              type="button"
              role="radio"
              aria-checked={environment === env}
              onClick={() => onEnvironmentChange(env)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                environment === env
                  ? env === 'production'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {env === 'sandbox' ? 'Sandbox' : 'Production'}
            </button>
          ))}
        </div>
      </div>
      {isProduction && (
        <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-xs font-semibold text-red-800">
          Warning: production mode uses real data and may incur costs.
        </p>
      )}
    </div>
  );
}

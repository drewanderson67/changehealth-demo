import type { Environment } from '../types/eligibility';

interface Props {
  environment: Environment;
}

export default function ClaimsStatus({ environment }: Props) {
  return (
    <div data-environment={environment} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="text-center py-12">
        <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Claims Status</h2>
        <p className="text-gray-600 mb-4">Check the status of submitted claims</p>
        <p className="text-sm text-gray-500">Coming soon...</p>
      </div>
    </div>
  );
}

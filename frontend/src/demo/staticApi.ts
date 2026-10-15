// Serves /api/* from the backend's mock Optum service inside the browser,
// so the app can be hosted as a static site (e.g. GitHub Pages) with no backend.
import {
  mockCheckEligibility,
  mockExportPayerList,
  mockGetAllPayers,
  mockLookupPayer,
  mockSubmitClaim,
  mockValidateClaim
} from '../../../backend/src/services/mockOptum';
import { writeCMS1500PDF } from '../../../backend/src/services/pdfGenerator';
import type { ClaimSubmissionRequest } from '../../../backend/src/services/types';

type Body = Record<string, unknown>;
type Route = { required?: string; run: (body: Body) => Promise<unknown> };

const env = (body: Body) => body.environment as string | undefined;

const routes: Record<string, Route> = {
  'status': { run: async () => ({ mock: true, staticDemo: true }) },
  'eligibility/check-eligibility': {
    required: 'eligibilityData',
    run: body => mockCheckEligibility(body.eligibilityData, env(body))
  },
  'eligibility/lookup-payer': { required: 'payerListParams', run: body => mockLookupPayer(body.payerListParams) },
  'eligibility/get-all-payers': { required: 'payerListParams', run: body => mockGetAllPayers(body.payerListParams) },
  'eligibility/export-payers': { required: 'payerListParams', run: body => mockExportPayerList(body.payerListParams) },
  'claims/validate': { required: 'claimData', run: body => mockValidateClaim(body.claimData) },
  'claims/submit': { required: 'claimData', run: body => mockSubmitClaim(body.claimData) }
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function pdf(claimData: ClaimSubmissionRequest): Promise<Response> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    try {
      writeCMS1500PDF(
        claimData,
        chunk => chunks.push(chunk),
        () => resolve(new Response(new Blob(chunks as BlobPart[], { type: 'application/pdf' }), {
          headers: { 'Content-Type': 'application/pdf' }
        }))
      );
    } catch (err) {
      reject(err);
    }
  });
}

async function handle(route: string, body: Body): Promise<Response> {
  if (route === 'claims/generate-pdf') {
    if (!body.claimData) return json({ message: 'claimData is required' }, 400);
    return pdf(body.claimData as ClaimSubmissionRequest);
  }
  const handler = routes[route];
  if (!handler) return json({ message: `Unknown API route: /api/${route}` }, 404);
  if (handler.required && !body[handler.required]) {
    return json({ message: `${handler.required} is required` }, 400);
  }
  return json(await handler.run(body));
}

export function installStaticApi(): void {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const { pathname } = new URL(href, window.location.href);
    const apiIndex = pathname.indexOf('/api/');
    if (apiIndex === -1) return realFetch(input, init);

    try {
      const body: Body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      return await handle(pathname.slice(apiIndex + '/api/'.length), body);
    } catch (err) {
      return json({ message: err instanceof Error ? err.message : String(err), statusCode: 500 }, 500);
    }
  };
}

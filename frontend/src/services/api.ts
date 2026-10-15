import type { EligibilityRequest, EligibilityResponse, Environment } from '../types/eligibility';
import { readErrorBody, fetchWithRetry } from './http';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9001';

export async function getBackendStatus(): Promise<{ mock: boolean }> {
  const response = await fetchWithRetry(`${API_BASE_URL}/api/status`);
  if (!response.ok) throw new Error(`Status check failed: ${response.status}`);
  return response.json();
}

export async function checkEligibility(
  data: EligibilityRequest,
  environment?: Environment
): Promise<EligibilityResponse> {
  const response = await fetchWithRetry(`${API_BASE_URL}/api/eligibility/check-eligibility`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eligibilityData: data,
      environment: environment || 'production'
    })
  });

  if (!response.ok) {
    const error = await readErrorBody(response);
    const errorMessage = error.message || `Request failed with status code ${error.statusCode || response.status}`;
    const fullError = {
      message: errorMessage,
      statusCode: error.statusCode || response.status,
      details: error.details
    };
    
    // Include full error details in the error message for debugging
    throw new Error(JSON.stringify(fullError, null, 2));
  }

  return response.json();
}

// PayerList v1 API response structure according to OpenAPI spec
export interface LinkedPayerIds {
  exchangeInstitutionalCPID?: string | null;
  exchangeProfessionalCPID?: string | null;
  iediDentalCPID?: string | null;
  iediInstitutionalCPID?: string | null;
  iediProfessionalCPID?: string | null;
  additionalPayerIDs?: string[] | null;
}

export interface PayerLookupResult {
  page: number;
  pageSize: number;
  total: number;
  payers: Payer[];
  meta?: {
    applicationMode?: string;
    responseTime?: number;
  };
  _optumApiRequest?: {
    url: string;
    method: string;
    params: unknown;
  };
}

export async function lookupPayer(
  payerId: string,
  environment?: Environment
): Promise<PayerLookupResult> {
  const payerListParams = {
    system: 'IMN', // IMN is the main system for Medical Network
    payerId: payerId,
    wildcardSearch: 'No'
  };

  const response = await fetchWithRetry(`${API_BASE_URL}/api/eligibility/lookup-payer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payerListParams,
      environment: environment || 'production'
    })
  });

  if (!response.ok) {
    const error = await readErrorBody(response);
    // Include Optum API details in error for debugging
    const errorMessage = error.message || 'Payer lookup failed';
    const fullError = {
      message: errorMessage,
      statusCode: error.statusCode || response.status,
      details: error.details,
      _optumApiRequest: error._optumApiRequest
    };
    throw new Error(JSON.stringify(fullError, null, 2));
  }

  return response.json();
}

// PayerList v1 API Payer object structure according to OpenAPI spec and API examples
export interface Payer {
  payerPlanName?: string | null;
  system?: string | null;
  payerId?: string | null;
  industryPayerId?: string | null;
  linkedPayerIds?: LinkedPayerIds;
  secondaryClaims?: boolean | null;
  payerNotes?: string | null;
  transactionType?: 'Advanced Notification' | 'Auth Inquiry' | 'Auth Referral' | 'Claim Status' | 'Claims Attachments' | 'Claims Institutional' | 'Claims Professional' | 'Dental Claims' | 'Dental Claim Attachments' | 'Dental ERA' | 'Eligibility' | 'ERA Institutional' | 'ERA Professional';
  status?: 'Active' | 'Inactive' | 'Standby' | 'Unknown';
  reportType?: string | null;
  enrollment?: {
    required?: boolean | null;
    notes?: string | null;
  };
  payerStandIn?: boolean | null;
  additionalInfo?: Array<{
    key?: string | null;
    value?: string | null;
  }>;
  connectionType?: string | null;
  activationDate?: string | null; // date format
  setupAdditionalPayerId?: string | null;
  chiPayer?: boolean | null;
  assurancePayer?: boolean | null;
  lchcPayer?: boolean | null;
  allowsDualClearinghouseEnrollment?: boolean | null;
  stateDoingBusiness?: Array<{
    label?: string | null;
    value?: string | null;
  }>;
  deactivationDate?: string | null; // date format
  attachmentType?: string | null;
  parPayer?: boolean | null;
  rpaPayerId?: string | null;
  workersCompensation?: boolean | null;
  imnPayerId?: string | null;
  dentalPayerId?: string | null;
  payerPlanAlias?: string | null;
  lastUpdated?: string; // date string from API response
  additionalPayerIDs?: string[]; // top-level column in the CSV export
}

export interface AllPayersResult {
  payers: Payer[];
  total: number;
  page?: number;
  pageSize?: number;
  meta?: {
    applicationMode?: string;
    responseTime?: number;
  };
  _optumApiRequest?: {
    url: string;
    method: string;
    params: unknown;
  };
}

export async function getAllPayers(
  environment?: Environment,
  payerListParams?: {
    system: string;
    transactionType?: string[];
    status?: string;
    page?: number;
    pageSize?: number;
    sort?: string[];
  }
): Promise<AllPayersResult> {
  const response = await fetchWithRetry(`${API_BASE_URL}/api/eligibility/get-all-payers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payerListParams: payerListParams || {
        system: 'IMN', // IMN is the main system for Medical Network
        transactionType: ['Eligibility'],
        status: 'Active',
        page: 1,
        pageSize: 100,
        sort: ['payerPlanName,asc']
      },
      environment: environment || 'production'
    })
  });

  if (!response.ok) {
    const error = await readErrorBody(response);
    // Include Optum API details in error for debugging
    const errorMessage = error.message || 'Failed to fetch payers';
    const fullError = {
      message: errorMessage,
      statusCode: error.statusCode || response.status,
      details: error.details,
      _optumApiRequest: error._optumApiRequest
    };
    throw new Error(JSON.stringify(fullError, null, 2));
  }

  return response.json();
}

export interface ExportPayersResult {
  csv: string;
  _optumApiRequest?: {
    url: string;
    method: string;
    params: unknown;
  };
}

/**
 * Export payers list as CSV using PayerList v1 API /payers/export endpoint
 * More efficient than paginating through all results
 */
export async function exportPayerList(
  environment?: Environment,
  payerListParams?: {
    system: string;
    transactionType?: string[];
    status?: string;
  }
): Promise<ExportPayersResult> {
  const response = await fetchWithRetry(`${API_BASE_URL}/api/eligibility/export-payers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payerListParams: payerListParams || {
        system: 'IMN', // IMN is the main system for Medical Network
        transactionType: ['Eligibility'],
        status: 'Active'
      },
      environment: environment || 'production'
    })
  });

  if (!response.ok) {
    const error = await readErrorBody(response);
    // Include Optum API details in error for debugging
    const errorMessage = error.message || 'Failed to export payers';
    const fullError = {
      message: errorMessage,
      statusCode: error.statusCode || response.status,
      details: error.details,
      _optumApiRequest: error._optumApiRequest
    };
    throw new Error(JSON.stringify(fullError, null, 2));
  }

  return response.json();
}

/**
 * Parse CSV data into Payer objects
 */
export function parseCsvToPayers(csv: string): Payer[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const payers: Payer[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const payer: Record<string, string | string[]> = {};
    
    headers.forEach((header, index) => {
      const value = values[index];
      if (value && value !== '') {
        // Split semicolon-separated additionalPayerIDs into array
        if (header === 'additionalPayerIDs') {
          payer[header] = value.split(';').map(id => id.trim()).filter(id => id !== '');
        } else {
          payer[header] = value;
        }
      }
    });
    
    payers.push(payer as Payer);
  }
  
  return payers;
}


import axios from 'axios';
import {
  isMockMode,
  mockCheckEligibility,
  mockLookupPayer,
  mockGetAllPayers,
  mockExportPayerList,
  mockValidateClaim,
  mockSubmitClaim
} from './mockOptum';

function getBaseUrl(environment?: string): string {
  const env = environment || 'production';
  return env === 'sandbox'
    ? 'https://sandbox-apigw.optum.com'
    : 'https://apigw.optum.com';
}

// PayerList API always uses production endpoint
function getPayerListBaseUrl(): string {
  return 'https://apigw.optum.com';
}

interface Credentials {
  clientId: string;
  clientSecret: string;
}

type ApiType = 'eligibility' | 'payer';

function resolveCredentials(environment?: string, apiType: ApiType = 'eligibility'): Credentials {
  const env = environment || 'production';

  // PayerList API always uses production endpoint, so always use prod payer creds
  if (apiType === 'payer') {
    return {
      clientId: process.env.OPTUM_PROD_PAYER_CLIENT_ID!,
      clientSecret: process.env.OPTUM_PROD_PAYER_CLIENT_SECRET!
    };
  }

  if (env === 'sandbox') {
    return {
      clientId: process.env.OPTUM_SANDBOX_CLIENT_ID!,
      clientSecret: process.env.OPTUM_SANDBOX_CLIENT_SECRET!
    };
  }

  return {
    clientId: process.env.OPTUM_PROD_ELIGIBILITY_CLIENT_ID!,
    clientSecret: process.env.OPTUM_PROD_ELIGIBILITY_CLIENT_SECRET!
  };
}

// Cache tokens per clientId and scope
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(credentials: Credentials, environment?: string, scope?: string): Promise<string> {
  const baseUrl = getBaseUrl(environment);
  const tokenUrl = `${baseUrl}/apip/auth/v2/token`;
  // Include scope in cache key to cache tokens separately per scope
  // Use 'no-scope' for undefined to differentiate from explicit scopes
  const scopeParam = scope !== undefined ? scope : 'no-scope';
  const cacheKey = `${credentials.clientId}-${environment || 'production'}-${scopeParam}`;

  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    console.log('Using cached token for client:', credentials.clientId.substring(0, 8) + '...', 'scope:', scope || '(no scope)');
    return cached.token;
  }

  console.log('Requesting new OAuth2 token from:', tokenUrl);
  console.log('Environment:', environment || 'production');
  console.log('Client ID (first 8 chars):', credentials.clientId.substring(0, 8) + '...');
  console.log('Scope:', scope || '(no scope)');

  // Build token request body - try without scope if scope is undefined, otherwise use the provided scope
  const tokenBody = scope !== undefined
    ? `grant_type=client_credentials&scope=${scope}`
    : 'grant_type=client_credentials';

  const response = await axios.post(tokenUrl,
    tokenBody,
    {
      auth: {
        username: credentials.clientId,
        password: credentials.clientSecret
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );

  const { access_token, expires_in } = response.data;
  console.log('✅ Token obtained successfully. Expires in:', expires_in, 'seconds');

  tokenCache.set(cacheKey, {
    token: access_token,
    expiresAt: Date.now() + (expires_in * 1000) - 60000
  });

  return access_token;
}

export async function checkEligibility(requestData: any, environment?: string) {
  if (isMockMode()) return mockCheckEligibility(requestData, environment);

  const creds = resolveCredentials(environment, 'eligibility');

  const baseUrl = getBaseUrl(environment);
  const token = await getAccessToken(creds, environment, undefined);

  console.log('Calling eligibility API:', `${baseUrl}/medicalnetwork/eligibility/v3/`);
  console.log('Request payload (passed through unchanged):', JSON.stringify(requestData, null, 2));

  const response = await axios.post(
    `${baseUrl}/medicalnetwork/eligibility/v3/`,
    requestData,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-chng-trace-id': requestData.controlNumber
      }
    }
  );

  console.log('✅ Eligibility check succeeded!');
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(response.data, null, 2));

  return response.data;
}

/**
 * Lookup a payer using PayerList v1 API
 * Uses Payer Lookup API credentials internally
 */
export async function lookupPayer(payerListParams: any, environment?: string) {
  if (isMockMode()) return mockLookupPayer(payerListParams);

  const creds = resolveCredentials(environment, 'payer');

  const baseUrl = getPayerListBaseUrl(); // Always use prod for PayerList
  const token = await getAccessToken(creds, 'production', undefined); // Always prod token for PayerList

  const optumApiUrl = `${baseUrl}/medicalnetwork/payerlist/v1/payers`;

  console.log('Looking up payer using PayerList v1 API:', optumApiUrl);
  console.log('Request params (passed through unchanged):', JSON.stringify(payerListParams, null, 2));

  const response = await axios.get(
    optumApiUrl,
    {
      params: payerListParams,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      paramsSerializer: {
        indexes: null
      }
    }
  );

  console.log('✅ Payer lookup succeeded!');
  console.log('Response status:', response.status);
  console.log('Total matches:', response.data.total);

  return {
    ...response.data,
    _optumApiRequest: {
      url: optumApiUrl,
      method: 'GET',
      params: payerListParams
    }
  };
}

/**
 * Get all payers using PayerList v1 API
 * Uses Payer Lookup API credentials internally
 */
export async function getAllPayers(payerListParams: any, environment?: string) {
  if (isMockMode()) return mockGetAllPayers(payerListParams);

  const creds = resolveCredentials(environment, 'payer');

  const baseUrl = getPayerListBaseUrl();
  const token = await getAccessToken(creds, 'production', undefined); // Always prod token for PayerList

  const optumApiUrl = `${baseUrl}/medicalnetwork/payerlist/v1/payers`;

  console.log('Calling PayerList API:', optumApiUrl);
  console.log('Request params (passed through unchanged):', JSON.stringify(payerListParams, null, 2));

  const response = await axios.get(
    optumApiUrl,
    {
      params: payerListParams,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      paramsSerializer: {
        indexes: null
      }
    }
  );

  console.log('✅ PayerList API call succeeded!');
  console.log('Response status:', response.status);
  console.log('Total payers:', response.data.total);

  return {
    ...response.data,
    _optumApiRequest: {
      url: optumApiUrl,
      method: 'GET',
      params: payerListParams
    }
  };
}

/**
 * Export payers list as CSV using PayerList v1 API /payers/export endpoint
 * Uses Payer Lookup API credentials internally
 */
export async function exportPayerList(payerListParams: any, environment?: string) {
  if (isMockMode()) return mockExportPayerList(payerListParams);

  const creds = resolveCredentials(environment, 'payer');

  const baseUrl = getPayerListBaseUrl();
  const token = await getAccessToken(creds, 'production', undefined); // Always prod token for PayerList

  const optumApiUrl = `${baseUrl}/medicalnetwork/payerlist/v1/payers/export`;

  console.log('Calling PayerList Export API:', optumApiUrl);
  console.log('Request params (passed through unchanged):', JSON.stringify(payerListParams, null, 2));

  const response = await axios.get(
    optumApiUrl,
    {
      params: payerListParams,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/csv'
      },
      paramsSerializer: {
        indexes: null
      }
    }
  );

  console.log('✅ PayerList Export API call succeeded!');
  console.log('Response status:', response.status);
  console.log('Response content-type:', response.headers['content-type']);
  console.log('CSV data length:', typeof response.data === 'string' ? response.data.length : 'NOT A STRING');
  console.log('CSV data type:', typeof response.data);
  console.log('CSV first 500 chars:', typeof response.data === 'string' ? response.data.substring(0, 500) : 'N/A');

  return {
    csv: response.data,
    _optumApiRequest: {
      url: optumApiUrl,
      method: 'GET',
      params: payerListParams
    }
  };
}

export async function validateClaim(requestData: any, environment?: string) {
  if (isMockMode()) return mockValidateClaim(requestData);

  const creds = resolveCredentials(environment, 'eligibility');

  const baseUrl = getBaseUrl(environment);
  const token = await getAccessToken(creds, environment, undefined);

  console.log('Calling claim validation API:', `${baseUrl}/medicalnetwork/professionalclaims/v3/validation`);
  console.log('Request payload:', JSON.stringify(requestData, null, 2));

  const response = await axios.post(
    `${baseUrl}/medicalnetwork/professionalclaims/v3/validation`,
    requestData,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-chng-trace-id': requestData.controlNumber || `trace-${Date.now()}`
      }
    }
  );

  console.log('✅ Claim validation succeeded!');
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(response.data, null, 2));

  return response.data;
}

export async function submitClaim(requestData: any, environment?: string) {
  if (isMockMode()) return mockSubmitClaim(requestData);

  const creds = resolveCredentials(environment, 'eligibility');

  const baseUrl = getBaseUrl(environment);
  const token = await getAccessToken(creds, environment, undefined);

  console.log('Calling claim submission API:', `${baseUrl}/medicalnetwork/professionalclaims/v3/submission`);
  console.log('Request payload:', JSON.stringify(requestData, null, 2));

  const response = await axios.post(
    `${baseUrl}/medicalnetwork/professionalclaims/v3/submission`,
    requestData,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-chng-trace-id': requestData.controlNumber || `trace-${Date.now()}`
      }
    }
  );

  console.log('✅ Claim submission succeeded!');
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(response.data, null, 2));

  return response.data;
}

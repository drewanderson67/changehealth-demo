import { useState, useEffect, useRef } from 'react';
import { lookupPayer, exportPayerList, parseCsvToPayers, type PayerLookupResult, type Payer } from '../services/api';
import providerOptionsData from '../data/providerOptions.json';
import type { EligibilityRequest, Environment } from '../types/eligibility';
import ApiResponseModal from './ApiResponseModal';

const STORAGE_KEY_PAYERS = 'optum-payers-list';
const STORAGE_KEY_PAYERS_CSV = 'optum-payers-csv';
const STORAGE_KEY_SELECTED_PAYER = 'optum-selected-payer';
const CUSTOM_PROVIDER_OPTION = 'custom';

type ProviderOption = {
  name: string;
  npi: string;
};

const PROVIDER_OPTIONS = providerOptionsData as ProviderOption[];

const getProviderSelectionValue = (name: string, npi: string) => {
  const match = PROVIDER_OPTIONS.find(
    (option) => option.name === name && option.npi === npi
  );
  return match?.npi || CUSTOM_PROVIDER_OPTION;
};

interface Props {
  onSubmit: (data: EligibilityRequest, alternatePayerIds?: string[]) => void;
  loading: boolean;
  environment: Environment;
}

const DEFAULT_FORM_DATA = {
  tradingPartnerServiceId: '',
  providerOrgName: '',
  providerNPI: '',
  memberId: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: 'M' as 'M' | 'F',
  groupNumber: '',
  ssn: ''
};

export default function EligibilityForm({ onSubmit, loading, environment }: Props) {
  const [formData, setFormData] = useState(() => {
    // Initialize based on environment
    const defaultData = DEFAULT_FORM_DATA;
    
    // Check localStorage for previously selected payer (keyed by environment)
    const savedPayerKey = `${STORAGE_KEY_SELECTED_PAYER}-${environment}`;
    const savedPayerId = localStorage.getItem(savedPayerKey);
    
    if (savedPayerId) {
      return {
        ...defaultData,
        tradingPartnerServiceId: savedPayerId
      };
    }
    
    return defaultData;
  });

  const [, setPayerLookup] = useState<{
    loading: boolean;
    result: PayerLookupResult | null;
    error: string | null;
    optumApiRequest: { url: string; method: string; params: unknown } | null;
  }>({
    loading: false,
    result: null,
    error: null,
    optumApiRequest: null
  });

  const [showPayerModal, setShowPayerModal] = useState(false);
  const [allPayers, setAllPayers] = useState<Payer[]>([]);
  const [loadingPayers, setLoadingPayers] = useState(false);
  const [payersError, setPayersError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [payersApiRequest, setPayersApiRequest] = useState<{
    endpoint: string;
    method: string;
    body: unknown;
  } | null>(null);
  const [payersApiResponse, setPayersApiResponse] = useState<Record<string, unknown> | null>(null);
  const [payerIdOverride, setPayerIdOverride] = useState('');

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load payers list function (extracted so it can be called manually)
  const loadPayers = async (clearCache = false) => {
    // Check localStorage cache first (keyed by environment)
    const cacheKey = `${STORAGE_KEY_PAYERS}-${environment}`;
    const csvCacheKey = `${STORAGE_KEY_PAYERS_CSV}-${environment}`;
    
    if (!clearCache) {
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        try {
          const cachedPayers = JSON.parse(cached);
          const cacheTime = cachedPayers.timestamp || 0;
          const cacheAge = Date.now() - cacheTime;
          // Use cache if less than 24 hours old (CSV export is more stable)
          if (cacheAge < 24 * 60 * 60 * 1000) {
            console.log('Using cached payer list (age:', Math.round(cacheAge / 1000 / 60), 'minutes)');
            setAllPayers(cachedPayers.payers || []);
            return;
          }
        } catch {
          console.log('Failed to parse cached payers, fetching fresh list');
        }
      }
    } else {
      // Clear cache if requested
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(csvCacheKey);
    }

    setLoadingPayers(true);
    setPayersError(null);

    // Build PayerList API params according to documentation
    const payerListParams = {
      system: 'IMN', // IMN is the main system for Medical Network
      transactionType: ['Eligibility'],
      status: 'Active'
    };

    try {
      // Use export endpoint to get all payers in CSV format
      console.log('Exporting payers list as CSV...');
      const exportResult = await exportPayerList(
        environment,
        payerListParams
      );
      
      // Extract the actual Optum API request details from response metadata
      if (exportResult._optumApiRequest) {
        setPayersApiRequest({
          endpoint: exportResult._optumApiRequest.url,
          method: exportResult._optumApiRequest.method,
          body: exportResult._optumApiRequest.params
        });
      }
      
      // Parse CSV data
      const payers = parseCsvToPayers(exportResult.csv);
      
      setAllPayers(payers);
      setPayersApiResponse({ 
        csvLength: exportResult.csv.length,
        parsedPayers: payers.length,
        sample: payers.slice(0, 3) // Show first 3 payers as sample
      });
      
      // Cache the results (both CSV and parsed)
      localStorage.setItem(cacheKey, JSON.stringify({
        payers: payers,
        timestamp: Date.now()
      }));
      localStorage.setItem(csvCacheKey, exportResult.csv);
      
      console.log(`✅ Loaded ${payers.length} payers from CSV export`);
      setPayersError(null); // Clear any previous errors
      
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));
      console.error('Failed to export payers:', error.message);
      
      // Parse error to get Optum API request details
      let errorDetails;
      try {
        errorDetails = JSON.parse(error.message);
      } catch {
        errorDetails = { message: error.message };
      }
      
      // Show the export API request in modal
      if (errorDetails._optumApiRequest) {
        setPayersApiRequest({
          endpoint: errorDetails._optumApiRequest.url,
          method: errorDetails._optumApiRequest.method,
          body: errorDetails._optumApiRequest.params
        });
      }
      
      setPayersError(errorDetails.message || error.message);
      setPayersApiResponse({ 
        error: errorDetails.message || error.message,
        details: errorDetails.details,
        statusCode: errorDetails.statusCode
      });
    } finally {
      setLoadingPayers(false);
    }
  };

  // Load payers list on mount and when environment changes
  useEffect(() => {
    loadPayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environment, retryCount]);

  // Update form data when environment changes
  useEffect(() => {
    const defaultData = DEFAULT_FORM_DATA;
    
    // Check localStorage for previously selected payer for this environment
    const savedPayerKey = `${STORAGE_KEY_SELECTED_PAYER}-${environment}`;
    const savedPayerId = localStorage.getItem(savedPayerKey);
    
    if (savedPayerId) {
      setFormData({
        ...defaultData,
        tradingPartnerServiceId: savedPayerId
      });
    } else {
      setFormData(defaultData);
    }
  }, [environment]);

  // Save selected payer to localStorage whenever it changes
  useEffect(() => {
    const payerId = formData.tradingPartnerServiceId;
    if (payerId) {
      const savedPayerKey = `${STORAGE_KEY_SELECTED_PAYER}-${environment}`;
      localStorage.setItem(savedPayerKey, payerId);
    }
  }, [formData.tradingPartnerServiceId, environment]);

  const selectedProviderValue = getProviderSelectionValue(
    formData.providerOrgName,
    formData.providerNPI
  );

  const handleProviderPresetChange = (value: string) => {
    if (value === CUSTOM_PROVIDER_OPTION) {
      setFormData((prev) => ({
        ...prev,
        providerOrgName: '',
        providerNPI: ''
      }));
      return;
    }

    const selectedOption = PROVIDER_OPTIONS.find((option) => option.npi === value);
    if (selectedOption) {
      setFormData((prev) => ({
        ...prev,
        providerOrgName: selectedOption.name,
        providerNPI: selectedOption.npi
      }));
    }
  };

  // Lookup payer when tradingPartnerServiceId changes
  useEffect(() => {
    // Clear previous timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    const payerId = formData.tradingPartnerServiceId.trim();
    
    // Reset if empty
    if (!payerId) {
      setPayerLookup({ loading: false, result: null, error: null, optumApiRequest: null });
      return;
    }

    // Set loading state
    setPayerLookup({ loading: true, result: null, error: null, optumApiRequest: null });

    // Debounce the API call
    debounceTimer.current = setTimeout(async () => {
      try {
        const result = await lookupPayer(
          payerId,
          environment
        );
        
        // Extract Optum API request details
        const optumApiRequest = result._optumApiRequest || null;
        const responseData = { ...result };
        delete responseData._optumApiRequest;
        
        setPayerLookup({ 
          loading: false, 
          result: responseData as PayerLookupResult, 
          error: null, 
          optumApiRequest 
        });
      } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));
        // Try to parse error message to extract Optum API details
        let errorDetails;
        try {
          errorDetails = JSON.parse(error.message);
        } catch {
          errorDetails = { message: error.message };
        }
        
        setPayerLookup({ 
          loading: false, 
          result: null, 
          error: errorDetails.message || error.message,
          optumApiRequest: errorDetails._optumApiRequest || null
        });
      }
    }, 500); // 500ms debounce

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [formData.tradingPartnerServiceId, environment]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Generate exactly 9-digit control number
    // For sandbox, use predefined values: "000000001", "000000002", "000000003", "000000004", "123456789"
    // For production, generate from timestamp
    const controlNumber = environment === 'sandbox' 
      ? '000000001' // Use predefined sandbox control number
      : String(Date.now()).slice(-9).padStart(9, '0');
    
    // Build request according to Optum Eligibility V3 API spec
    // According to docs: only controlNumber and subscriber are required
    const request: EligibilityRequest = {
      controlNumber: controlNumber,
      tradingPartnerServiceId: (payerIdOverride || formData.tradingPartnerServiceId).substring(0, 80),
      subscriber: {
        memberId: formData.memberId.substring(0, 80),
        firstName: formData.firstName.substring(0, 35),
        lastName: formData.lastName.substring(0, 60),
        gender: formData.gender,
        dateOfBirth: formData.dateOfBirth.replace(/-/g, ''),
        ...(formData.groupNumber && { groupNumber: formData.groupNumber.substring(0, 50) }),
        ...(formData.ssn && { ssn: formData.ssn.substring(0, 50) })
      }
    };

    // Provider is optional - include only if fields are provided
    if (formData.providerOrgName || formData.providerNPI) {
      request.provider = {};
      if (formData.providerOrgName) {
        request.provider.organizationName = formData.providerOrgName.substring(0, 60);
      }
      if (formData.providerNPI) {
        request.provider.npi = formData.providerNPI.substring(0, 80);
      }
    }

    // Encounter object is optional - removed as it's not necessary for basic eligibility checks
    // If needed for specific service type checks, it can be added back

    // Basic validation for required fields
    if (request.controlNumber.length !== 9 || !/^\d{9}$/.test(request.controlNumber)) {
      alert('Control number must be exactly 9 digits');
      return;
    }
    if (request.subscriber.memberId.length < 2) {
      alert('Member ID must be at least 2 characters');
      return;
    }
    if (!/^[A-Za-z0-9-]+$/.test(request.subscriber.memberId)) {
      alert('Member ID can only contain letters, numbers, and hyphens');
      return;
    }

    // Get alternate payer IDs from selected payer if available
    const selectedPayer = allPayers.find(p => p.payerId === (payerIdOverride || formData.tradingPartnerServiceId));
    
    // Debug logging
    console.log('Selected payer:', selectedPayer);
    console.log('Looking for payerId:', payerIdOverride || formData.tradingPartnerServiceId);
    
    // additionalPayerIDs is parsed as a top-level field from CSV (column 9)
    const alternateIds = selectedPayer?.additionalPayerIDs || [];
    
    console.log('Selected payer name:', selectedPayer?.payerPlanName);
    console.log('Primary payer ID:', payerIdOverride || formData.tradingPartnerServiceId);
    console.log('Alternate payer IDs:', alternateIds);
    console.log('Total IDs to try:', 1 + alternateIds.length);
    
    onSubmit(request, alternateIds);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold">Eligibility Check</h2>
      
      <div className="space-y-4 border p-4 rounded">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Payer</h3>
          <button
            type="button"
            onClick={() => {
              const cacheKey = `${STORAGE_KEY_PAYERS}-${environment}`;
              const csvCacheKey = `${STORAGE_KEY_PAYERS_CSV}-${environment}`;
              localStorage.removeItem(cacheKey);
              localStorage.removeItem(csvCacheKey);
              setAllPayers([]);
              setRetryCount(prev => prev + 1);
            }}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Clear Payer Cache
          </button>
        </div>
        <div className="space-y-2">
          {loadingPayers ? (
            <div className="text-sm text-gray-500">Loading payer list...</div>
          ) : payersError ? (
            // Show error if API call failed
            <div className="space-y-2">
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
                <div className="font-semibold mb-1">Failed to load payer list</div>
                <div className="text-xs">{payersError}</div>
                {payersError.includes('401') && (
                  <div className="text-xs font-semibold mt-2">
                    Note: 401 Unauthorized suggests the Payer Lookup API credentials may not have permission to fetch payers.
                    Please check the backend .env configuration.
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRetryCount(prev => prev + 1);
                      loadPayers(true); // Clear cache and retry
                    }}
                    className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    disabled={loadingPayers}
                  >
                    {loadingPayers ? 'Loading...' : 'Retry'}
                  </button>
                  {payersApiRequest && (
                    <button
                      type="button"
                      onClick={() => setShowPayerModal(true)}
                      className="px-3 py-2 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                    >
                      View API Request/Response
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : allPayers.length > 0 ? (
            // Use API-fetched payers
            <select
              required={!payerIdOverride}
              value={formData.tradingPartnerServiceId}
              onChange={(e) => {
                setFormData({...formData, tradingPartnerServiceId: e.target.value});
              }}
              className="w-full p-2 border rounded font-mono text-sm"
            >
              <option value="">Name                                              | Payer ID</option>
              {allPayers.map((payer, index) => {
                const payerId = payer.payerId || '';
                const name = (payer.payerPlanName || 'Unknown').substring(0, 50);
                const key = payerId || `payer-${index}`;
                
                // Format as table with padding
                const formattedName = name.padEnd(50, ' ');
                
                return (
                  <option key={key} value={payerId}>
                    {formattedName} | {payerId}
                  </option>
                );
              })}
            </select>
          ) : (
            // No payers loaded yet and no error (initial state)
            <div className="text-sm text-gray-500">
              Waiting for payer list to load...
            </div>
          )}
          <div className="mt-2">
            <label className="text-sm text-gray-600">Override Payer ID (optional):</label>
            <input
              placeholder="Leave empty to use dropdown selection"
              value={payerIdOverride}
              onChange={(e) => setPayerIdOverride(e.target.value)}
              className="w-full p-2 border rounded text-sm"
            />
            {payerIdOverride && (
              <div className="text-xs text-blue-600 mt-1">
                Will use override value: {payerIdOverride}
              </div>
            )}
          </div>
          
          {/* Show additional payer IDs when a payer is selected */}
          {formData.tradingPartnerServiceId && !payerIdOverride && (() => {
            const selectedPayer = allPayers.find(p => p.payerId === formData.tradingPartnerServiceId);
            const additionalIds = selectedPayer?.additionalPayerIDs || [];
            
            if (additionalIds.length > 0) {
              const reversedIds = [...additionalIds].reverse();
              return (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded">
                  <div className="text-xs font-semibold text-gray-700 mb-1">
                    Will try these payer IDs in order (reverse of CSV list):
                  </div>
                  <div className="text-xs font-mono space-y-1">
                    {reversedIds.map((id: string, idx: number) => (
                      <div key={idx} className="text-blue-700">
                        {idx + 1}. {id}
                      </div>
                    ))}
                    <div className="text-gray-600">{reversedIds.length + 1}. {formData.tradingPartnerServiceId} (primary, last resort)</div>
                  </div>
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>

      <div className="space-y-4 border p-4 rounded">
        <h3 className="font-semibold">
          Provider
          <span className="text-xs text-gray-500 ml-2">(Optional)</span>
        </h3>
        <div>
          <label className="text-sm text-gray-600">Select Provider Preset</label>
          <select
            value={selectedProviderValue}
            onChange={(e) => handleProviderPresetChange(e.target.value)}
            className="w-full p-2 border rounded mt-1"
          >
            <option value={CUSTOM_PROVIDER_OPTION}>Custom provider</option>
            {PROVIDER_OPTIONS.map((option) => (
              <option key={option.npi} value={option.npi}>
                {`${option.name} (${option.npi})`}
              </option>
            ))}
          </select>
        </div>
        <input
          placeholder="Organization Name (optional)"
          value={formData.providerOrgName}
          onChange={(e) => setFormData({...formData, providerOrgName: e.target.value})}
          className="w-full p-2 border rounded"
        />
        <input
          placeholder="NPI - 10 digits (optional)"
          pattern="\d{10}"
          value={formData.providerNPI}
          onChange={(e) => setFormData({...formData, providerNPI: e.target.value})}
          className="w-full p-2 border rounded"
        />
      </div>

      <div className="space-y-4 border p-4 rounded">
        <h3 className="font-semibold">Patient</h3>
        <input
          required
          placeholder="Member ID"
          value={formData.memberId}
          onChange={(e) => setFormData({...formData, memberId: e.target.value})}
          className="w-full p-2 border rounded"
        />
        <div className="grid grid-cols-2 gap-4">
          <input
            required
            placeholder="First Name"
            value={formData.firstName}
            onChange={(e) => setFormData({...formData, firstName: e.target.value})}
            className="p-2 border rounded"
          />
          <input
            required
            placeholder="Last Name"
            value={formData.lastName}
            onChange={(e) => setFormData({...formData, lastName: e.target.value})}
            className="p-2 border rounded"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <input
            required
            type="date"
            value={formData.dateOfBirth}
            onChange={(e) => setFormData({...formData, dateOfBirth: e.target.value})}
            className="p-2 border rounded"
          />
          <select
            required
            value={formData.gender}
            onChange={(e) => setFormData({...formData, gender: e.target.value as 'M' | 'F'})}
            className="p-2 border rounded"
          >
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
        </div>
        <input
          placeholder="Group Number (optional)"
          value={formData.groupNumber}
          onChange={(e) => setFormData({...formData, groupNumber: e.target.value})}
          className="w-full p-2 border rounded"
        />
        <input
          placeholder="SSN (optional)"
          value={formData.ssn}
          onChange={(e) => setFormData({...formData, ssn: e.target.value})}
          className="w-full p-2 border rounded"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        {loading ? 'Checking...' : 'Check Eligibility'}
      </button>

      {/* PayerList API Response Modal - Shows actual Optum API calls */}
      <ApiResponseModal
        isOpen={showPayerModal}
        onClose={() => setShowPayerModal(false)}
        title="Optum PayerList v1 API Request/Response"
        request={payersApiRequest || undefined}
        response={payersApiResponse || undefined}
        error={payersError || undefined}
      />
    </form>
  );
}

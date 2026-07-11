import { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  ClaimSubmissionRequest,
  ServiceLine,
  ClaimResponse,
  Provider,
  Subscriber,
  Dependent,
  ServiceFacilityLocation
} from '../types/claims';
import type { Environment } from '../types/eligibility';
import { validateClaim, submitClaim, generateClaimPDF } from '../services/claimsApi';
import { exportPayerList, parseCsvToPayers, type Payer } from '../services/api';
import providerOptionsData from '../data/providerOptions.json';
import ClaimResponseDisplay from './ClaimResponseDisplay';
import EnvironmentSelector from './EnvironmentSelector';
import ApiResponseModal from './ApiResponseModal';

interface Props {
  environment: Environment;
  onEnvironmentChange?: (env: Environment) => void;
}

const STORAGE_KEY_PAYERS = 'optum-payers-list-claims';
const STORAGE_KEY_PAYERS_CSV = 'optum-payers-csv-claims';
const STORAGE_KEY_SELECTED_PAYER = 'optum-selected-payer-claims';
const STORAGE_KEY_FORM_DATA = 'optum-claim-form-data';
const STORAGE_KEY_USAGE_INDICATOR = 'optum-claim-usage-indicator';
const CUSTOM_PROVIDER_OPTION = 'custom';

type ProviderOption = {
  name: string; // Display label in dropdown
  organizationName: string; // Actual value submitted to API
  npi: string;
  ein?: string;
  address?: {
    address1: string;
    city: string;
    state: string;
    postalCode: string;
  };
  phone?: string;
  contactName?: string;
  contactEmail?: string;
  taxonomyCode?: string;
};

const PROVIDER_OPTIONS = providerOptionsData as ProviderOption[];
const DEFAULT_TEST_TAXONOMY_CODE = '208D00000X';

function getUniquePayers(payers: Payer[]): Payer[] {
  const seenPayerIds = new Set<string>();

  return payers.flatMap((payer) => {
    const payerId = String(payer.payerId ?? '').trim();

    // A payer without an ID cannot be selected, and duplicate IDs would create
    // duplicate React keys and indistinguishable select options.
    if (!payerId || seenPayerIds.has(payerId)) {
      return [];
    }

    seenPayerIds.add(payerId);
    return [{ ...payer, payerId }];
  });
}

// US States for dropdown
const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' }
];

// Phone number formatting function
function formatPhoneNumber(value: string): string {
  // Remove all non-digit characters
  const digits = value.replace(/\D/g, '');
  
  // Limit to 10 digits
  const limited = digits.slice(0, 10);
  
  // Format as XXX-XXX-XXXX
  if (limited.length <= 3) {
    return limited;
  } else if (limited.length <= 6) {
    return `${limited.slice(0, 3)}-${limited.slice(3)}`;
  } else {
    return `${limited.slice(0, 3)}-${limited.slice(3, 6)}-${limited.slice(6)}`;
  }
}

// Currency formatting function - formats as user types (right to left with decimal)
function formatCurrency(value: string): string {
  // Remove all non-digit characters
  const digits = value.replace(/\D/g, '');
  
  if (digits === '') return '';
  
  // Convert to cents and format as dollars.cents
  const cents = parseInt(digits, 10);
  const dollars = Math.floor(cents / 100);
  const centsRemainder = cents % 100;
  
  // Format with 2 decimal places
  return `${dollars}.${centsRemainder.toString().padStart(2, '0')}`;
}

// Parse currency string to store as cents (integer)
function parseCurrencyToCents(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits;
}

// Format SSN: XXX-XX-XXXX
function formatSSN(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

// Validate SSN (9 digits)
function validateSSN(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 9 && /^\d{9}$/.test(digits);
}


function formatDateForAPI(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.replace(/-/g, '');
}

function formatDateForInput(dateStr: string): string {
  if (!dateStr) return '';
  if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
  }
  return dateStr;
}

function createEmptyServiceLine(): ServiceLine {
  return {
    serviceDate: '',
    serviceDateEnd: '',
    professionalService: {
      procedureIdentifier: 'HC',
      procedureCode: '',
      procedureModifiers: [],
      lineItemChargeAmount: '',
      measurementUnit: 'UN',
      serviceUnitCount: '1',
      placeOfServiceCode: '10',
      compositeDiagnosisCodePointers: {
        diagnosisCodePointers: []
      }
    }
  };
}

function generateControlNumber(): string {
  return String(Date.now() % 1_000_000_000).padStart(9, '0');
}

function normalizeControlNumber(value?: string): string {
  const digits = (value || '').replace(/\D/g, '');
  return digits ? digits.slice(-9).padStart(9, '0') : generateControlNumber();
}

function normalizeDiagnosisCode(value: string): string {
  return value.toUpperCase().replace(/\./g, '').trim();
}

function diagnosisPointerForApi(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (/^\d{1,2}$/.test(normalized)) return normalized;

  const index = 'ABCDEFGHIJKL'.indexOf(normalized);
  return index >= 0 ? String(index + 1) : normalized;
}

function diagnosisPointerForDisplay(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (/^\d{1,2}$/.test(normalized)) {
    const index = Number(normalized) - 1;
    return 'ABCDEFGHIJKL'[index] || normalized;
  }
  return normalized;
}

function createInitialFormData(): Partial<ClaimSubmissionRequest> {
  return {
    controlNumber: generateControlNumber(),
    subscriber: {
      paymentResponsibilityLevelCode: 'P'
    },
    billing: {
      taxIdType: 'EIN',
      providerType: 'BillingProvider'
    },
    claimInformation: {
      claimFilingCode: 'CI',
      patientControlNumber: '',
      claimChargeAmount: '0',
      placeOfServiceCode: '10',
      claimFrequencyCode: '1',
      signatureIndicator: 'Y',
      planParticipationCode: 'A',
      benefitsAssignmentCertificationIndicator: 'Y',
      releaseInformationCode: 'Y',
      healthCareCodeInformation: [],
      serviceLines: [createEmptyServiceLine()],
      patientAmountPaid: '0',
      outsideLab: false,
      hasOtherHealthBenefitPlan: false
    }
  };
}

function normalizeSavedFormData(savedData: Partial<ClaimSubmissionRequest>): Partial<ClaimSubmissionRequest> {
  const initial = createInitialFormData();
  const savedClaimInformation = savedData.claimInformation;
  const savedSubscriber = savedData.subscriber;
  const selfDependent = savedData.dependent?.relationshipToSubscriberCode === ('18' as string)
    ? savedData.dependent
    : undefined;

  return {
    ...savedData,
    controlNumber: normalizeControlNumber(savedData.controlNumber),
    tradingPartnerName: savedData.tradingPartnerName || savedData.receiver?.organizationName,
    subscriber: {
      ...savedSubscriber,
      ...(selfDependent ? {
        firstName: selfDependent.firstName || savedSubscriber?.firstName,
        lastName: selfDependent.lastName || savedSubscriber?.lastName,
        middleName: selfDependent.middleName || savedSubscriber?.middleName,
        gender: selfDependent.gender || savedSubscriber?.gender,
        dateOfBirth: selfDependent.dateOfBirth || savedSubscriber?.dateOfBirth,
        address: selfDependent.address || savedSubscriber?.address,
        contactInformation: selfDependent.contactInformation || savedSubscriber?.contactInformation
      } : {}),
      paymentResponsibilityLevelCode: 'P'
    },
    dependent: selfDependent ? undefined : savedData.dependent,
    billing: {
      ...savedData.billing,
      providerType: 'BillingProvider'
    },
    rendering: savedData.rendering ? {
      ...savedData.rendering,
      providerType: 'RenderingProvider'
    } : undefined,
    referring: savedData.referring ? {
      ...savedData.referring,
      providerType: 'ReferringProvider'
    } : undefined,
    claimInformation: {
      ...initial.claimInformation,
      ...savedClaimInformation,
      claimFilingCode: 'CI',
      claimFrequencyCode: savedClaimInformation?.claimFrequencyCode || '1',
      planParticipationCode: savedClaimInformation?.planParticipationCode || 'A',
      signatureIndicator: savedClaimInformation?.signatureIndicator || 'Y',
      benefitsAssignmentCertificationIndicator: savedClaimInformation?.benefitsAssignmentCertificationIndicator || 'Y',
      releaseInformationCode: savedClaimInformation?.releaseInformationCode || 'Y',
      hasOtherHealthBenefitPlan: false,
      serviceLines: savedClaimInformation?.serviceLines?.length
        ? savedClaimInformation.serviceLines
        : [createEmptyServiceLine()]
    } as ClaimSubmissionRequest['claimInformation']
  };
}

function hasProviderIdentity(provider?: Partial<Provider>): boolean {
  return Boolean(
    provider?.npi ||
    provider?.organizationName ||
    provider?.firstName ||
    provider?.lastName ||
    provider?.commercialNumber
  );
}

function providerDisplayName(provider: Partial<Provider>): string {
  return provider.organizationName || [provider.firstName, provider.middleName, provider.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
}

interface BuildClaimOptions {
  submitAsTest: boolean;
  patientSignatureOnFile: boolean;
  authorizedSignatureOnFile: boolean;
  physicianSignatureOnFile: boolean;
  selectedPayerName: string;
}

function buildPrimaryClaimRequest(
  formData: Partial<ClaimSubmissionRequest>,
  options: BuildClaimOptions
): ClaimSubmissionRequest {
  const errors: string[] = [];
  const requireValue = (value: unknown, label: string) => {
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push(label);
    }
  };

  const payerId = formData.tradingPartnerServiceId?.trim() || '';
  const payerName = formData.tradingPartnerName?.trim()
    || formData.receiver?.organizationName?.trim()
    || options.selectedPayerName.trim();
  requireValue(payerId, 'Payer ID');
  requireValue(payerName, 'Payer name');

  const requireDigits = (value: string | undefined, length: number, label: string) => {
    if (value && !new RegExp(`^\\d{${length}}$`).test(value.replace(/\D/g, ''))) {
      errors.push(`${label} (${length} digits)`);
    }
  };

  const subscriberSource = formData.subscriber;
  const subscriberName = [subscriberSource?.firstName, subscriberSource?.lastName].filter(Boolean).join(' ').trim();
  requireValue(subscriberSource?.memberId, "Box 1a - Insured's ID");
  requireValue(subscriberSource?.firstName, "Box 4 - Insured's first name");
  requireValue(subscriberSource?.lastName, "Box 4 - Insured's last name");
  requireValue(subscriberSource?.dateOfBirth, "Box 11a - Insured's date of birth");
  requireValue(subscriberSource?.gender, "Box 11a - Insured's gender");
  requireValue(subscriberSource?.address?.address1, "Box 7 - Insured's street address");
  requireValue(subscriberSource?.address?.city, "Box 7 - Insured's city");
  requireValue(subscriberSource?.address?.state, "Box 7 - Insured's state");
  requireValue(subscriberSource?.address?.postalCode, "Box 7 - Insured's ZIP code");

  const subscriber: Subscriber = {
    ...subscriberSource,
    paymentResponsibilityLevelCode: 'P',
    memberId: subscriberSource?.memberId?.trim(),
    firstName: subscriberSource?.firstName?.trim(),
    lastName: subscriberSource?.lastName?.trim(),
    dateOfBirth: formatDateForAPI(subscriberSource?.dateOfBirth || ''),
    address: subscriberSource?.address ? { ...subscriberSource.address } : undefined,
    contactInformation: subscriberSource?.contactInformation ? {
      ...subscriberSource.contactInformation,
      name: subscriberSource.contactInformation.name?.trim() || subscriberName || 'Subscriber'
    } : undefined
  };

  let dependent: Dependent | undefined;
  if (formData.dependent) {
    const dependentSource = formData.dependent;
    requireValue(dependentSource.firstName, "Box 2 - Patient's first name");
    requireValue(dependentSource.lastName, "Box 2 - Patient's last name");
    requireValue(dependentSource.dateOfBirth, "Box 3 - Patient's date of birth");
    requireValue(dependentSource.gender, "Box 3 - Patient's gender");
    requireValue(dependentSource.relationshipToSubscriberCode, 'Box 6 - Patient relationship');
    requireValue(dependentSource.address?.address1, "Box 5 - Patient's street address");
    requireValue(dependentSource.address?.city, "Box 5 - Patient's city");
    requireValue(dependentSource.address?.state, "Box 5 - Patient's state");
    requireValue(dependentSource.address?.postalCode, "Box 5 - Patient's ZIP code");

    const dependentName = [dependentSource.firstName, dependentSource.lastName].filter(Boolean).join(' ').trim();
    dependent = {
      ...dependentSource,
      firstName: dependentSource.firstName?.trim() || '',
      lastName: dependentSource.lastName?.trim() || '',
      dateOfBirth: formatDateForAPI(dependentSource.dateOfBirth),
      address: dependentSource.address ? { ...dependentSource.address } : undefined,
      contactInformation: dependentSource.contactInformation ? {
        ...dependentSource.contactInformation,
        name: dependentSource.contactInformation.name?.trim() || dependentName || 'Patient'
      } : undefined
    };
  }

  const billingSource = formData.billing;
  const billingName = billingSource ? providerDisplayName(billingSource) : '';
  const billingTaxIdType = billingSource?.taxIdType || (billingSource?.ssn ? 'SSN' : 'EIN');
  const billingTaxId = billingTaxIdType === 'SSN' ? billingSource?.ssn : billingSource?.employerId;
  requireValue(billingName, 'Box 33 - Billing provider name');
  requireValue(billingSource?.npi, 'Box 33a - Billing provider NPI');
  requireValue(billingTaxId, 'Box 25 - Federal tax ID');
  requireValue(billingSource?.address?.address1, 'Box 33 - Billing provider street address');
  requireValue(billingSource?.address?.city, 'Box 33 - Billing provider city');
  requireValue(billingSource?.address?.state, 'Box 33 - Billing provider state');
  requireValue(billingSource?.address?.postalCode, 'Box 33 - Billing provider ZIP code');
  requireValue(billingSource?.contactInformation?.phoneNumber, 'Box 33 - Billing provider phone');
  requireValue(billingSource?.contactInformation?.name, 'Box 33 - Billing contact name');
  requireValue(billingSource?.taxonomyCode, 'Box 33 - Billing provider taxonomy code');
  requireDigits(billingSource?.npi, 10, 'Box 33a - Billing provider NPI');
  requireDigits(billingTaxId, 9, 'Box 25 - Federal tax ID');

  const billing: Provider = {
    ...billingSource,
    providerType: 'BillingProvider',
    taxIdType: billingTaxIdType,
    organizationName: billingSource?.organizationName?.trim(),
    npi: billingSource?.npi?.replace(/\D/g, ''),
    employerId: billingTaxIdType === 'EIN' ? billingSource?.employerId?.replace(/\D/g, '') : undefined,
    ssn: billingTaxIdType === 'SSN' ? billingSource?.ssn?.replace(/\D/g, '') : undefined,
    address: billingSource?.address ? { ...billingSource.address } : undefined,
    contactInformation: billingSource?.contactInformation ? {
      ...billingSource.contactInformation,
      name: billingSource.contactInformation.name?.trim() || billingName || 'Billing Contact'
    } : undefined
  };

  const diagnoses = (formData.claimInformation?.healthCareCodeInformation || [])
    .filter((diagnosis) => diagnosis.diagnosisCode?.trim())
    .map((diagnosis, index) => ({
      diagnosisTypeCode: index === 0 ? 'ABK' : 'ABF',
      diagnosisCode: normalizeDiagnosisCode(diagnosis.diagnosisCode)
    }));
  if (diagnoses.length === 0) errors.push('Box 21 - At least one diagnosis code');

  const serviceLines = (formData.claimInformation?.serviceLines || []).map((line, index) => {
    const lineNumber = index + 1;
    requireValue(line.serviceDate, `Box 24A - Service line ${lineNumber} date`);
    requireValue(line.professionalService?.placeOfServiceCode || formData.claimInformation?.placeOfServiceCode, `Box 24B - Service line ${lineNumber} place of service`);
    requireValue(line.professionalService?.procedureCode, `Box 24D - Service line ${lineNumber} procedure code`);
    requireValue(line.professionalService?.lineItemChargeAmount, `Box 24F - Service line ${lineNumber} charge`);
    requireValue(line.professionalService?.serviceUnitCount, `Box 24G - Service line ${lineNumber} units`);

    const pointers = (line.professionalService?.compositeDiagnosisCodePointers?.diagnosisCodePointers || [])
      .filter(Boolean)
      .slice(0, 4)
      .map(diagnosisPointerForApi);
    if (pointers.length === 0) errors.push(`Box 24E - Service line ${lineNumber} diagnosis pointer`);
    if (pointers.some((pointer) => !/^\d{1,2}$/.test(pointer) || Number(pointer) < 1 || Number(pointer) > diagnoses.length)) {
      errors.push(`Box 24E - Service line ${lineNumber} diagnosis pointer must reference Box 21`);
    }

    let renderingProvider: Provider | undefined;
    if (hasProviderIdentity(line.renderingProvider)) {
      const renderingSource = line.renderingProvider!;
      requireValue(renderingSource.npi, `Box 24J - Service line ${lineNumber} rendering NPI`);
      requireValue(providerDisplayName(renderingSource), `Box 24J - Service line ${lineNumber} rendering provider name`);
      requireDigits(renderingSource.npi, 10, `Box 24J - Service line ${lineNumber} rendering NPI`);
      renderingProvider = {
        ...renderingSource,
        providerType: 'RenderingProvider',
        npi: renderingSource.npi?.replace(/\D/g, '')
      };
    }

    return {
      ...line,
      serviceDate: formatDateForAPI(line.serviceDate),
      serviceDateEnd: line.serviceDateEnd ? formatDateForAPI(line.serviceDateEnd) : undefined,
      professionalService: {
        ...line.professionalService,
        procedureIdentifier: line.professionalService?.procedureIdentifier || 'HC',
        procedureCode: line.professionalService?.procedureCode?.trim().toUpperCase() || '',
        procedureModifiers: line.professionalService?.procedureModifiers?.filter(Boolean).slice(0, 4),
        lineItemChargeAmount: formatCurrency(line.professionalService?.lineItemChargeAmount || ''),
        measurementUnit: line.professionalService?.measurementUnit || 'UN',
        serviceUnitCount: line.professionalService?.serviceUnitCount || '',
        placeOfServiceCode: line.professionalService?.placeOfServiceCode || formData.claimInformation?.placeOfServiceCode,
        compositeDiagnosisCodePointers: {
          diagnosisCodePointers: pointers
        }
      },
      renderingProvider
    } as ServiceLine;
  });
  if (serviceLines.length === 0) errors.push('Box 24 - At least one service line');

  const patientControlNumber = formData.claimInformation?.patientControlNumber?.trim() || '';
  requireValue(patientControlNumber, "Box 26 - Patient's account number");

  let serviceFacilityLocation: ServiceFacilityLocation | undefined;
  const facilitySource = formData.claimInformation?.serviceFacilityLocation;
  if (facilitySource?.organizationName || facilitySource?.npi || facilitySource?.address?.address1) {
    requireValue(facilitySource.organizationName, 'Box 32 - Service facility name');
    requireValue(facilitySource.address?.address1, 'Box 32 - Service facility street address');
    requireValue(facilitySource.address?.city, 'Box 32 - Service facility city');
    requireValue(facilitySource.address?.state, 'Box 32 - Service facility state');
    requireValue(facilitySource.address?.postalCode, 'Box 32 - Service facility ZIP code');
    requireValue(facilitySource.npi, 'Box 32a - Service facility NPI');
    requireDigits(facilitySource.npi, 10, 'Box 32a - Service facility NPI');
    if (facilitySource.phoneNumber) {
      requireValue(facilitySource.phoneName, 'Box 32 - Service facility contact name');
    }
    serviceFacilityLocation = {
      ...facilitySource,
      organizationName: facilitySource.organizationName || '',
      address: facilitySource.address || { address1: '', city: '' },
      npi: facilitySource.npi?.replace(/\D/g, '')
    };
  }

  const claimSupplementalInformation = formData.claimInformation?.claimSupplementalInformation;
  const claimFrequencyCode = formData.claimInformation?.claimFrequencyCode || '1';
  if (claimFrequencyCode !== '1') {
    requireValue(claimSupplementalInformation?.claimControlNumber, 'Box 22 - Original payer claim control number');
  }

  const submitterSource = formData.submitter;
  const submitter = {
    ...submitterSource,
    organizationName: submitterSource?.organizationName || billingName,
    contactInformation: {
      ...submitterSource?.contactInformation,
      name: submitterSource?.contactInformation?.name || billing.contactInformation?.name || billingName,
      phoneNumber: submitterSource?.contactInformation?.phoneNumber || billing.contactInformation?.phoneNumber || ''
    }
  };

  const rendering = hasProviderIdentity(formData.rendering) ? {
    ...formData.rendering,
    providerType: 'RenderingProvider' as const,
    npi: formData.rendering?.npi?.replace(/\D/g, '')
  } : undefined;
  let referring: Provider | undefined;
  if (hasProviderIdentity(formData.referring)) {
    requireValue(providerDisplayName(formData.referring!), 'Box 17 - Referring provider name');
    requireValue(formData.referring?.npi, 'Box 17b - Referring provider NPI');
    requireDigits(formData.referring?.npi, 10, 'Box 17b - Referring provider NPI');
    referring = {
      ...formData.referring,
      providerType: 'ReferringProvider',
      npi: formData.referring?.npi?.replace(/\D/g, '')
    };
  }

  if (errors.length > 0) {
    throw new Error(`Please complete the required claim fields:\n- ${errors.join('\n- ')}`);
  }

  const totalChargeCents = (formData.claimInformation?.serviceLines || []).reduce((total, line) => {
    const rawAmount = line.professionalService?.lineItemChargeAmount || '0';
    return total + Number.parseInt(rawAmount.replace(/\D/g, '') || '0', 10);
  }, 0);

  const supplementalInformation = claimSupplementalInformation ? {
    ...claimSupplementalInformation,
    claimControlNumber: claimFrequencyCode === '1'
      ? undefined
      : claimSupplementalInformation.claimControlNumber?.trim()
  } : undefined;
  const hasSupplementalInformation = supplementalInformation
    && Object.values(supplementalInformation).some((value) => value !== undefined && value !== '');

  return {
    controlNumber: normalizeControlNumber(formData.controlNumber),
    tradingPartnerServiceId: payerId,
    tradingPartnerName: payerName,
    usageIndicator: options.submitAsTest ? 'T' : 'P',
    submitter,
    receiver: { organizationName: payerName },
    subscriber,
    ...(dependent ? { dependent } : {}),
    billing,
    ...(rendering ? { rendering } : {}),
    ...(referring ? { referring } : {}),
    claimInformation: {
      claimFilingCode: 'CI',
      patientControlNumber,
      placeOfServiceCode: formData.claimInformation?.placeOfServiceCode || '10',
      claimChargeAmount: formatCurrency(String(totalChargeCents)),
      planParticipationCode: formData.claimInformation?.planParticipationCode || 'A',
      claimFrequencyCode,
      signatureIndicator: options.physicianSignatureOnFile ? 'Y' : 'N',
      benefitsAssignmentCertificationIndicator: options.authorizedSignatureOnFile ? 'Y' : 'N',
      releaseInformationCode: options.patientSignatureOnFile ? 'Y' : 'I',
      patientAmountPaid: formatCurrency(formData.claimInformation?.patientAmountPaid || '0'),
      ...(hasSupplementalInformation ? { claimSupplementalInformation: supplementalInformation } : {}),
      ...(formData.claimInformation?.propertyCasualtyClaimNumber ? { propertyCasualtyClaimNumber: formData.claimInformation.propertyCasualtyClaimNumber } : {}),
      ...(formData.claimInformation?.relatedCausesCode?.length ? { relatedCausesCode: formData.claimInformation.relatedCausesCode } : {}),
      ...(formData.claimInformation?.autoAccidentStateCode ? { autoAccidentStateCode: formData.claimInformation.autoAccidentStateCode } : {}),
      ...(formData.claimInformation?.claimDateInformation ? { claimDateInformation: formData.claimInformation.claimDateInformation } : {}),
      ...(formData.claimInformation?.claimNote ? { claimNote: formData.claimInformation.claimNote } : {}),
      ...(serviceFacilityLocation ? { serviceFacilityLocation } : {}),
      healthCareCodeInformation: diagnoses,
      serviceLines
    }
  };
}

export default function ClaimForm({ environment, onEnvironmentChange }: Props) {
  // Load form data from localStorage or use defaults
  const [formData, setFormData] = useState<Partial<ClaimSubmissionRequest>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_FORM_DATA);
    if (saved) {
      try {
        return normalizeSavedFormData(JSON.parse(saved));
      } catch {
        console.log('Failed to parse saved form data');
      }
    }
    
    return createInitialFormData();
  });
  
  // Usage indicator state (T=Test, P=Production)
  const [submitAsTest, setSubmitAsTest] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_USAGE_INDICATOR);
    return saved ? saved === 'true' : true; // Default to test mode
  });
  
  // Local state for signature fields (not in API structure)
  const [patientSignatureOnFile, setPatientSignatureOnFile] = useState(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_FORM_DATA}-patientSignature`);
    return saved ? saved === 'true' : true;
  });
  const [authorizedSignatureOnFile, setAuthorizedSignatureOnFile] = useState(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_FORM_DATA}-authorizedSignature`);
    return saved ? saved === 'true' : true;
  });
  const [physicianSignatureOnFile, setPhysicianSignatureOnFile] = useState(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_FORM_DATA}-physicianSignature`);
    return saved ? saved === 'true' : true;
  });

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ClaimResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<ClaimSubmissionRequest | null>(null);
  const [actionType, setActionType] = useState<'validate' | 'submit' | null>(null);

  // Payer state
  const [allPayers, setAllPayers] = useState<Payer[]>([]);
  const [loadingPayers, setLoadingPayers] = useState(false);
  const [payersError, setPayersError] = useState<string | null>(null);
  const [showPayerModal, setShowPayerModal] = useState(false);
  const [payersApiRequest, setPayersApiRequest] = useState<{
    endpoint: string;
    method: string;
    body: unknown;
  } | null>(null);
  const [payersApiResponse, setPayersApiResponse] = useState<Record<string, unknown> | null>(null);
  const [selectedPayerName, setSelectedPayerName] = useState<string>('');
  const displayedPayers = useMemo(() => getUniquePayers(allPayers), [allPayers]);
  const patientIsSubscriber = !formData.dependent;

  // Provider state
  const [selectedProviderOption, setSelectedProviderOption] = useState<string>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY_FORM_DATA}-providerOption`);
    return saved || CUSTOM_PROVIDER_OPTION;
  });

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_FORM_DATA, JSON.stringify(formData));
  }, [formData]);

  // Save usage indicator to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_USAGE_INDICATOR, submitAsTest.toString());
  }, [submitAsTest]);

  // Save signature states to localStorage
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_FORM_DATA}-patientSignature`, patientSignatureOnFile.toString());
    localStorage.setItem(`${STORAGE_KEY_FORM_DATA}-authorizedSignature`, authorizedSignatureOnFile.toString());
    localStorage.setItem(`${STORAGE_KEY_FORM_DATA}-physicianSignature`, physicianSignatureOnFile.toString());
  }, [patientSignatureOnFile, authorizedSignatureOnFile, physicianSignatureOnFile]);

  // Save provider option to localStorage
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_FORM_DATA}-providerOption`, selectedProviderOption);
  }, [selectedProviderOption]);

  // Load payers list function
  const loadPayers = useCallback(async (clearCache = false) => {
    const cacheKey = `${STORAGE_KEY_PAYERS}-${environment}`;
    const csvCacheKey = `${STORAGE_KEY_PAYERS_CSV}-${environment}`;
    
    if (!clearCache) {
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        try {
          const cachedPayers = JSON.parse(cached);
          const cacheTime = cachedPayers.timestamp || 0;
          const cacheAge = Date.now() - cacheTime;
          // Use cache if less than 24 hours old
          if (cacheAge < 24 * 60 * 60 * 1000) {
            console.log('Using cached payer list for claims (age:', Math.round(cacheAge / 1000 / 60), 'minutes)');
            const payers = getUniquePayers(cachedPayers.payers || []);
            setAllPayers(payers);

            if (payers.length !== (cachedPayers.payers || []).length) {
              localStorage.setItem(cacheKey, JSON.stringify({
                ...cachedPayers,
                payers
              }));
            }
            return;
          }
        } catch {
          console.log('Failed to parse cached payers, fetching fresh list');
        }
      }
    } else {
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(csvCacheKey);
    }

    setLoadingPayers(true);
    setPayersError(null);

    const payerListParams = {
      system: 'IMN',
      transactionType: ['Eligibility'],
      status: 'Active'
    };

    try {
      console.log('Exporting payers list as CSV for claims...');
      const exportResult = await exportPayerList(
        environment,
        payerListParams
      );
      
      if (exportResult._optumApiRequest) {
        setPayersApiRequest({
          endpoint: exportResult._optumApiRequest.url,
          method: exportResult._optumApiRequest.method,
          body: exportResult._optumApiRequest.params
        });
      }
      
      const parsedPayers = parseCsvToPayers(exportResult.csv);
      const payers = getUniquePayers(parsedPayers);
      
      setAllPayers(payers);
      setPayersApiResponse({ 
        csvLength: exportResult.csv.length,
        parsedPayers: payers.length,
        sample: payers.slice(0, 3)
      });
      
      localStorage.setItem(cacheKey, JSON.stringify({
        payers: payers,
        timestamp: Date.now()
      }));
      localStorage.setItem(csvCacheKey, exportResult.csv);
      
      console.log(`✅ Loaded ${payers.length} payers from CSV export for claims`);
      setPayersError(null);
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to export payers for claims:', errorMessage);
      
      let errorDetails;
      try {
        errorDetails = JSON.parse(errorMessage);
      } catch {
        errorDetails = { message: errorMessage };
      }
      
      if (errorDetails._optumApiRequest) {
        setPayersApiRequest({
          endpoint: errorDetails._optumApiRequest.url,
          method: errorDetails._optumApiRequest.method,
          body: errorDetails._optumApiRequest.params
        });
      }
      
      setPayersError(errorDetails.message || errorMessage);
      setPayersApiResponse({ 
        error: errorDetails.message || errorMessage,
        details: errorDetails.details,
        statusCode: errorDetails.statusCode
      });
    } finally {
      setLoadingPayers(false);
    }
  }, [environment]);

  // Handle provider dropdown change
  const handleProviderPresetChange = (value: string) => {
    setSelectedProviderOption(value);
    
    if (value === CUSTOM_PROVIDER_OPTION) {
      // Clear provider fields when custom is selected
      return;
    }

    const selectedOption = PROVIDER_OPTIONS.find((option) => option.npi === value);
    if (selectedOption) {
      // Populate both Box 32 (Service Facility) and Box 33 (Billing Provider)
      setFormData((prev) => {
        const newData = { ...prev };
        
        // Box 33 (Billing Provider) - use organizationName for submission
        newData.billing = {
          ...newData.billing,
          providerType: 'BillingProvider',
          organizationName: selectedOption.organizationName,
          npi: selectedOption.npi,
          employerId: selectedOption.ein || newData.billing?.employerId,
          taxIdType: selectedOption.ein ? 'EIN' : newData.billing?.taxIdType,
          address: selectedOption.address ? {
            address1: selectedOption.address.address1,
            city: selectedOption.address.city,
            state: selectedOption.address.state,
            postalCode: selectedOption.address.postalCode
          } : newData.billing?.address,
          contactInformation: {
            ...newData.billing?.contactInformation,
            name: newData.billing?.contactInformation?.name || 'Billing Department',
            phoneNumber: selectedOption.phone || newData.billing?.contactInformation?.phoneNumber
          }
        };
        
        // Box 32 (Service Facility Location) - use organizationName for submission
        newData.claimInformation = {
          ...newData.claimInformation,
          serviceFacilityLocation: {
            organizationName: selectedOption.organizationName,
            npi: selectedOption.npi,
            phoneName: selectedOption.contactName || 'Facility Contact',
            phoneNumber: selectedOption.phone,
            address: selectedOption.address ? {
              address1: selectedOption.address.address1,
              city: selectedOption.address.city,
              state: selectedOption.address.state,
              postalCode: selectedOption.address.postalCode
            } : undefined
          }
        } as Partial<ClaimSubmissionRequest>['claimInformation'];
        
        return newData;
      });
    }
  };

  // Handle payer selection
  const handlePayerChange = useCallback((payerId: string) => {
    const selectedPayer = allPayers.find(p => p.payerId === payerId);
    
    setFormData((prev) => {
      const newData = { ...prev };
      
      // Set trading partner service ID
      newData.tradingPartnerServiceId = payerId;
      
      // Set receiver organization name from payer
      if (selectedPayer) {
        const payerName = selectedPayer.payerPlanName || selectedPayer.payerId || '';
        newData.tradingPartnerName = payerName;
        newData.receiver = {
          organizationName: payerName
        };
        setSelectedPayerName(selectedPayer.payerPlanName || '');
      }
      
      return newData;
    });
    
    // Save to localStorage
    const savedPayerKey = `${STORAGE_KEY_SELECTED_PAYER}-${environment}`;
    localStorage.setItem(savedPayerKey, payerId);
  }, [allPayers, environment]);

  // Load payers on mount and when environment changes
  useEffect(() => {
    loadPayers();
  }, [loadPayers]);

  // Load previously selected payer on mount
  useEffect(() => {
    const savedPayerKey = `${STORAGE_KEY_SELECTED_PAYER}-${environment}`;
    const savedPayerId = localStorage.getItem(savedPayerKey);
    if (savedPayerId && formData.tradingPartnerServiceId !== savedPayerId) {
      handlePayerChange(savedPayerId);
    }
  }, [environment, formData.tradingPartnerServiceId, handlePayerChange]);

  // Clear response when environment changes (but keep form data)
  useEffect(() => {
    setResponse(null);
    setError(null);
  }, [environment]);

  // Auto-calculate Box 28 (Total Charge) from sum of all Box 24f (service line charges)
  useEffect(() => {
    const serviceLines = formData.claimInformation?.serviceLines || [];
    let totalCents = 0;
    
    serviceLines.forEach(line => {
      const chargeAmount = line.professionalService?.lineItemChargeAmount;
      if (chargeAmount && chargeAmount !== '') {
        // Charge amounts are stored as strings of digits (cents)
        const cents = parseInt(chargeAmount, 10);
        if (!isNaN(cents)) {
          totalCents += cents;
        }
      }
    });
    
    // Update Box 28 with the calculated total (only if different to avoid infinite loop)
    const totalAsString = totalCents.toString();
    const currentTotal = formData.claimInformation?.claimChargeAmount || '0';
    if (currentTotal !== totalAsString) {
      updateField(['claimInformation', 'claimChargeAmount'], totalAsString);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.claimInformation?.serviceLines]);

  const updateField = (path: string[], value: unknown) => {
    setFormData(prev => {
      const previousRoot = prev as Record<string, unknown>;
      const newData = { ...previousRoot };
      let previous: Record<string, unknown> | undefined = previousRoot;
      let current = newData;

      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        const previousValue: unknown = previous ? previous[key] : undefined;
        const nextValue: Record<string, unknown> = previousValue && typeof previousValue === 'object'
          ? { ...(previousValue as Record<string, unknown>) }
          : {};
        current[key] = nextValue;
        current = nextValue;
        previous = previousValue && typeof previousValue === 'object'
          ? previousValue as Record<string, unknown>
          : undefined;
      }

      current[path[path.length - 1]] = value;
      return newData as Partial<ClaimSubmissionRequest>;
    });
  };

  const setPatientRelationship = (relationship: '18' | Dependent['relationshipToSubscriberCode']) => {
    setFormData((prev) => {
      if (relationship === '18') {
        const patient = prev.dependent;
        return {
          ...prev,
          subscriber: {
            ...prev.subscriber,
            ...(patient ? {
              firstName: patient.firstName,
              lastName: patient.lastName,
              middleName: patient.middleName,
              suffix: patient.suffix,
              gender: patient.gender,
              dateOfBirth: patient.dateOfBirth,
              address: patient.address,
              contactInformation: patient.contactInformation
            } : {}),
            paymentResponsibilityLevelCode: 'P'
          },
          dependent: undefined
        };
      }

      return {
        ...prev,
        subscriber: {
          ...prev.subscriber,
          paymentResponsibilityLevelCode: 'P'
        },
        dependent: {
          firstName: prev.dependent?.firstName || '',
          lastName: prev.dependent?.lastName || '',
          middleName: prev.dependent?.middleName,
          suffix: prev.dependent?.suffix,
          gender: prev.dependent?.gender || 'U',
          dateOfBirth: prev.dependent?.dateOfBirth || '',
          relationshipToSubscriberCode: relationship,
          address: prev.dependent?.address || {
            address1: '',
            city: '',
            state: '',
            postalCode: ''
          },
          contactInformation: prev.dependent?.contactInformation
        }
      };
    });
  };

  const addServiceLine = () => {
    const currentLines = formData.claimInformation?.serviceLines || [];
    if (currentLines.length >= 6) return;
    
    const newLine = createEmptyServiceLine();
    
    updateField(['claimInformation', 'serviceLines'], [...currentLines, newLine]);
  };

  const updateServiceLine = (index: number, field: string, value: string) => {
    const serviceLines = [...(formData.claimInformation?.serviceLines || [])];
    if (!serviceLines[index]) return;
    
    if (field.includes('.')) {
      const [mainField, subField] = field.split('.');
      serviceLines[index] = {
        ...serviceLines[index],
        [mainField]: {
          ...(serviceLines[index] as unknown as Record<string, Record<string, unknown>>)[mainField],
          [subField]: value
        }
      } as ServiceLine;
    } else {
      serviceLines[index] = {
        ...serviceLines[index],
        [field]: value
      } as ServiceLine;
    }
    updateField(['claimInformation', 'serviceLines'], serviceLines);
  };

  const updateDiagnosis = (index: number, value: string) => {
    const diagnoses = [...(formData.claimInformation?.healthCareCodeInformation || [])];
    if (!diagnoses[index]) {
      diagnoses[index] = { diagnosisTypeCode: 'ABK', diagnosisCode: value };
    } else {
      diagnoses[index].diagnosisCode = value;
    }
    updateField(['claimInformation', 'healthCareCodeInformation'], diagnoses);
  };

  const handleValidate = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    setActionType('validate');

    try {
      const claimRequest = buildPrimaryClaimRequest(formData, {
        submitAsTest,
        patientSignatureOnFile,
        authorizedSignatureOnFile,
        physicianSignatureOnFile,
        selectedPayerName
      });
      setLastRequest(claimRequest);
      const result = await validateClaim(claimRequest, environment);
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    setActionType('submit');

    try {
      const claimRequest = buildPrimaryClaimRequest(formData, {
        submitAsTest,
        patientSignatureOnFile,
        authorizedSignatureOnFile,
        physicianSignatureOnFile,
        selectedPayerName
      });
      setLastRequest(claimRequest);
      const result = await submitClaim(claimRequest, environment);
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!lastRequest) {
      setError('No claim data available. Please validate or submit a claim first.');
      return;
    }

    try {
      const pdfBlob = await generateClaimPDF(lastRequest);
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cms1500_claim_${lastRequest.controlNumber || 'generated'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Ensure at least one service line exists
  const serviceLines = formData.claimInformation?.serviceLines || [];
  const effectiveServiceLines = serviceLines;
  
  const diagnoses = formData.claimInformation?.healthCareCodeInformation || [];
  
  const removeServiceLine = (index: number) => {
    const updated = effectiveServiceLines.filter((_, i) => i !== index);
    updateField(['claimInformation', 'serviceLines'], updated);
  };

  const clearForm = () => {
    setFormData(createInitialFormData());
    setPatientSignatureOnFile(true);
    setAuthorizedSignatureOnFile(true);
    setPhysicianSignatureOnFile(true);
    setSelectedProviderOption(CUSTOM_PROVIDER_OPTION);
    setResponse(null);
    setError(null);
  };

  const loadDefaultData = () => {
    const timestamp = Date.now().toString().slice(-6);
    const defaultProvider = PROVIDER_OPTIONS[0];
    const defaultPayer = allPayers.find((payer) => payer.payerId === '87726') || allPayers[0];
    const defaultPayerId = defaultPayer?.payerId || '87726';
    const defaultPayerName = defaultPayer?.payerPlanName || 'UnitedHealthcare';
    const serviceDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const patientAddress = {
      address1: '123 Main St',
      city: 'Portland',
      state: 'OR',
      postalCode: '97201'
    };
    const providerAddress = defaultProvider?.address || {
      address1: '4784 SE 17th Ave, Ste 225',
      city: 'Portland',
      state: 'OR',
      postalCode: '97202'
    };

    const testData: Partial<ClaimSubmissionRequest> = {
      controlNumber: generateControlNumber(),
      tradingPartnerServiceId: defaultPayerId,
      tradingPartnerName: defaultPayerName,
      submitter: {
        organizationName: defaultProvider?.organizationName || 'Reperio Health Medical Group, PLLC',
        contactInformation: {
          name: 'Billing Department',
          phoneNumber: defaultProvider?.phone || '5551234567',
          email: 'billing@reperio.health'
        }
      },
      receiver: {
        organizationName: defaultPayerName
      },
      subscriber: {
        paymentResponsibilityLevelCode: 'P',
        memberId: 'TEST123456789',
        firstName: 'Taylor',
        lastName: 'Morgan',
        gender: 'M',
        dateOfBirth: '19800115',
        address: { ...patientAddress },
        contactInformation: {
          name: 'Taylor Morgan',
          phoneNumber: '5035550100'
        }
      },
      billing: {
        providerType: 'BillingProvider',
        organizationName: defaultProvider?.organizationName || 'Reperio Health Medical Group, PLLC',
        npi: defaultProvider?.npi || '1982438362',
        taxIdType: 'EIN',
        employerId: defaultProvider?.ein || '994567305',
        // Demo-only fallback keeps Load Default Data immediately valid. Real
        // provider presets should supply their enrolled billing taxonomy.
        taxonomyCode: defaultProvider?.taxonomyCode || DEFAULT_TEST_TAXONOMY_CODE,
        address: { ...providerAddress },
        contactInformation: {
          name: defaultProvider?.contactName || 'Billing Department',
          phoneNumber: defaultProvider?.phone || '5551234567',
          email: defaultProvider?.contactEmail || 'billing@reperio.health'
        }
      },
      claimInformation: {
        claimFilingCode: 'CI',
        patientControlNumber: `PAT${timestamp}`,
        claimChargeAmount: '15000',
        placeOfServiceCode: '02',
        claimFrequencyCode: '1',
        signatureIndicator: 'Y',
        planParticipationCode: 'A',
        benefitsAssignmentCertificationIndicator: 'Y',
        releaseInformationCode: 'Y',
        serviceFacilityLocation: {
          organizationName: defaultProvider?.organizationName || 'Reperio Health Medical Group, PLLC',
          npi: defaultProvider?.npi || '1982438362',
          phoneName: defaultProvider?.contactName || 'Facility Contact',
          phoneNumber: defaultProvider?.phone || '5551234567',
          address: { ...providerAddress }
        },
        healthCareCodeInformation: [
          { diagnosisTypeCode: 'ABK', diagnosisCode: 'Z0000' }
        ],
        serviceLines: [
          {
            serviceDate,
            professionalService: {
              procedureIdentifier: 'HC',
              procedureCode: '99213',
              lineItemChargeAmount: '15000',
              measurementUnit: 'UN',
              serviceUnitCount: '1',
              placeOfServiceCode: '02',
              compositeDiagnosisCodePointers: {
                diagnosisCodePointers: ['1']
              }
            }
          }
        ],
        outsideLab: false
      }
    };
    
    setFormData(testData);
    setSelectedPayerName(defaultPayerName);
    setSelectedProviderOption(defaultProvider?.npi || CUSTOM_PROVIDER_OPTION);
    setSubmitAsTest(true);
    setPatientSignatureOnFile(true);
    setAuthorizedSignatureOnFile(true);
    setPhysicianSignatureOnFile(true);
    setResponse(null);
    setError(null);
    setLastRequest(null);
    setActionType(null);
    localStorage.setItem(`${STORAGE_KEY_SELECTED_PAYER}-${environment}`, defaultPayerId);
  };

  const patient = patientIsSubscriber ? formData.subscriber : formData.dependent;
  const patientFieldRoot = patientIsSubscriber ? 'subscriber' : 'dependent';

  return (
    <div className="w-full">
      {/* Environment Selector */}
      {onEnvironmentChange && (
        <div className="mb-4">
          <EnvironmentSelector
            environment={environment}
            onEnvironmentChange={onEnvironmentChange}
          />
          
          {/* Usage Indicator and Form Controls */}
          <div className="mt-2 p-4 bg-gray-50 border border-gray-300 rounded">
            <div className="flex items-center justify-between flex-wrap gap-4">
              {/* Submit as Test Checkbox */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="submitAsTest"
                  checked={submitAsTest}
                  onChange={(e) => setSubmitAsTest(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="submitAsTest" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Submit as Test? 
                  <span className="ml-2 text-xs text-gray-500">
                    (usageIndicator: {submitAsTest ? 'T' : 'P'})
                  </span>
                </label>
                {!submitAsTest && (
                  <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-semibold">
                    LIVE MODE
                  </span>
                )}
              </div>
              
              {/* Form Control Buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={loadDefaultData}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Load Default Data
                </button>
                <button
                  type="button"
                  onClick={clearForm}
                  className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                >
                  Clear Form
                </button>
              </div>
            </div>
            
            <div className="mt-2 text-xs text-gray-600">
              {submitAsTest ? (
                <p>✅ Test mode: Claim will be validated but NOT submitted to payer</p>
              ) : (
                <p className="text-red-700 font-semibold">⚠️ Live mode: Claim WILL be submitted to payer for processing</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CMS 1500 Form - Single Column Layout */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="space-y-4 max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-[#c41e3a] mb-1">HEALTH INSURANCE CLAIM FORM</h2>
            <p className="text-xs text-gray-600">APPROVED BY NATIONAL UNIFORM CLAIM COMMITTEE (NUCC) 02/12</p>
          </div>

          {/* Payer Selection */}
          <div className="pb-4 border-b-2 border-gray-300">
            <label className="text-sm font-bold text-gray-700 mb-2 block">Payer (Insurance Company)</label>
            {loadingPayers ? (
              <div className="p-2 text-gray-500">Loading payers...</div>
            ) : payersError ? (
              <div className="space-y-2">
                <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {payersError}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => loadPayers(true)}
                    className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                  >
                    Retry
                  </button>
                  {payersApiRequest && (
                    <button
                      type="button"
                      onClick={() => setShowPayerModal(true)}
                      className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                    >
                      View API Request/Response
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <select
                value={formData.tradingPartnerServiceId || ''}
                onChange={(e) => handlePayerChange(e.target.value)}
                className="w-full p-2 border rounded font-mono text-sm"
              >
                <option value="">Name                                              | Payer ID</option>
                {displayedPayers.map((payer) => {
                  const payerId = payer.payerId || '';
                  const name = (payer.payerPlanName || 'Unknown').substring(0, 50);
                  const formattedName = name.padEnd(50, ' ');
                  
                  return (
                    <option key={payerId} value={payerId}>
                      {formattedName} | {payerId}
                    </option>
                  );
                })}
              </select>
            )}
            <p className="mt-2 text-xs text-gray-600">
              Payer responsibility: <span className="font-semibold">Primary (P)</span>
            </p>
          </div>

          {/* Provider Selection (populates Box 32 & 33) */}
          <div className="pb-4 border-b-2 border-gray-300">
            <label className="text-sm font-bold text-gray-700 mb-2 block">
              Provider (Billing & Service Facility)
            </label>
            <select
              value={selectedProviderOption}
              onChange={(e) => handleProviderPresetChange(e.target.value)}
              className="w-full p-2 border rounded mb-2"
            >
              <option value={CUSTOM_PROVIDER_OPTION}>-- Enter Custom Provider --</option>
              {PROVIDER_OPTIONS.map((provider) => (
                <option key={provider.npi} value={provider.npi}>
                  {provider.name} (NPI: {provider.npi})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              This will populate both Box 32 (Service Facility) and Box 33 (Billing Provider)
            </p>
          </div>

          {/* Box 1 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">1. Insurance Type</label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked disabled className="w-4 h-4" />
              <span className="text-sm">COMMERCIAL INSURANCE (CI)</span>
            </label>
          </div>

          {/* Box 1a */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">1a. INSURED'S I.D. NUMBER</label>
            <input
              type="text"
              value={formData.subscriber?.memberId || ''}
              onChange={(e) => updateField(['subscriber', 'memberId'], e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>

          {/* Box 2 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">2. PATIENT'S NAME (Last Name, First Name, Middle Initial)</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <input
                type="text"
                value={patient?.lastName ?? ''}
                onChange={(e) => updateField([patientFieldRoot, 'lastName'], e.target.value)}
                placeholder="Last Name"
                className="p-2 border rounded"
              />
              <input
                type="text"
                value={patient?.firstName ?? ''}
                onChange={(e) => updateField([patientFieldRoot, 'firstName'], e.target.value)}
                placeholder="First Name"
                className="p-2 border rounded"
              />
              <input
                type="text"
                value={patient?.middleName ?? ''}
                onChange={(e) => updateField([patientFieldRoot, 'middleName'], e.target.value)}
                placeholder="MI"
                maxLength={1}
                className="p-2 border rounded"
              />
              <input
                type="text"
                value={patient?.suffix ?? ''}
                onChange={(e) => updateField([patientFieldRoot, 'suffix'], e.target.value)}
                placeholder="Suffix"
                className="p-2 border rounded"
              />
            </div>
          </div>

          {/* Box 5 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">5. PATIENT'S ADDRESS</label>
            <div className="space-y-2">
              <input
                type="text"
                value={patient?.address?.address1 ?? ''}
                onChange={(e) => updateField([patientFieldRoot, 'address', 'address1'], e.target.value)}
                placeholder="Street Address"
                className="w-full p-2 border rounded"
              />
              <div className="grid grid-cols-3 gap-4">
                <input
                  type="text"
                  value={patient?.address?.city ?? ''}
                  onChange={(e) => updateField([patientFieldRoot, 'address', 'city'], e.target.value)}
                  placeholder="City"
                  className="p-2 border rounded"
                />
                <select
                  value={patient?.address?.state ?? ''}
                  onChange={(e) => updateField([patientFieldRoot, 'address', 'state'], e.target.value)}
                  className="p-2 border rounded"
                >
                  <option value="">State</option>
                  {US_STATES.map(state => (
                    <option key={state.code} value={state.code}>
                      {state.code} - {state.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={patient?.address?.postalCode ?? ''}
                  onChange={(e) => updateField([patientFieldRoot, 'address', 'postalCode'], e.target.value.replace(/\D/g, '').slice(0, 9))}
                  placeholder="ZIP Code"
                  className="p-2 border rounded"
                />
              </div>
              <input
                type="tel"
                value={patient?.contactInformation?.phoneNumber ? formatPhoneNumber(patient.contactInformation.phoneNumber) : ''}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  updateField([patientFieldRoot, 'contactInformation', 'name'], patient?.contactInformation?.name || [patient?.firstName, patient?.lastName].filter(Boolean).join(' '));
                  updateField([patientFieldRoot, 'contactInformation', 'phoneNumber'], digits);
                }}
                placeholder="Telephone"
                className="w-full p-2 border rounded"
              />
            </div>
          </div>

          {/* Box 3 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">3. PATIENT'S BIRTH DATE</label>
            <div className="flex items-center gap-4">
              <input
                type="date"
                value={patient?.dateOfBirth ? formatDateForInput(patient.dateOfBirth) : ''}
                onChange={(e) => updateField([patientFieldRoot, 'dateOfBirth'], e.target.value)}
                className="p-2 border rounded"
              />
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold text-[#c41e3a]">SEX</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={patient?.gender === 'M'}
                    onChange={() => updateField([patientFieldRoot, 'gender'], 'M')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">M</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={patient?.gender === 'F'}
                    onChange={() => updateField([patientFieldRoot, 'gender'], 'F')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">F</span>
                </label>
              </div>
            </div>
          </div>

          {/* Box 6 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">6. PATIENT RELATIONSHIP TO INSURED</label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={patientIsSubscriber}
                  onChange={(e) => e.target.checked && setPatientRelationship('18')}
                  className="w-4 h-4"
                />
                <span className="text-sm">Self</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.dependent?.relationshipToSubscriberCode === '01'}
                  onChange={(e) => e.target.checked && setPatientRelationship('01')}
                  className="w-4 h-4"
                />
                <span className="text-sm">Spouse</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.dependent?.relationshipToSubscriberCode === '19'}
                  onChange={(e) => e.target.checked && setPatientRelationship('19')}
                  className="w-4 h-4"
                />
                <span className="text-sm">Child</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.dependent?.relationshipToSubscriberCode === 'G8'}
                  onChange={(e) => e.target.checked && setPatientRelationship('G8')}
                  className="w-4 h-4"
                />
                <span className="text-sm">Other</span>
              </label>
            </div>
          </div>

          {/* Box 4 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">4. INSURED'S NAME (Last Name, First Name, Middle Initial)</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <input
                type="text"
                value={formData.subscriber?.lastName ?? ''}
                onChange={(e) => updateField(['subscriber', 'lastName'], e.target.value)}
                placeholder="Last Name"
                className="p-2 border rounded"
              />
              <input
                type="text"
                value={formData.subscriber?.firstName ?? ''}
                onChange={(e) => updateField(['subscriber', 'firstName'], e.target.value)}
                placeholder="First Name"
                className="p-2 border rounded"
              />
              <input
                type="text"
                value={formData.subscriber?.middleName ?? ''}
                onChange={(e) => updateField(['subscriber', 'middleName'], e.target.value)}
                placeholder="MI"
                maxLength={1}
                className="p-2 border rounded"
              />
              <input
                type="text"
                value={formData.subscriber?.suffix ?? ''}
                onChange={(e) => updateField(['subscriber', 'suffix'], e.target.value)}
                placeholder="Suffix"
                className="p-2 border rounded"
              />
            </div>
          </div>

          {/* Box 7 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">7. INSURED'S ADDRESS</label>
            <div className="space-y-2">
              <input
                type="text"
                value={formData.subscriber?.address?.address1 || ''}
                onChange={(e) => updateField(['subscriber', 'address', 'address1'], e.target.value)}
                placeholder="Street Address"
                className="w-full p-2 border rounded"
              />
              <div className="grid grid-cols-3 gap-4">
                <input
                  type="text"
                  value={formData.subscriber?.address?.city || ''}
                  onChange={(e) => updateField(['subscriber', 'address', 'city'], e.target.value)}
                  placeholder="City"
                  className="p-2 border rounded"
                />
                <select
                  value={formData.subscriber?.address?.state || ''}
                  onChange={(e) => updateField(['subscriber', 'address', 'state'], e.target.value)}
                  className="p-2 border rounded"
                >
                  <option value="">State</option>
                  {US_STATES.map(state => (
                    <option key={state.code} value={state.code}>
                      {state.code} - {state.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={formData.subscriber?.address?.postalCode || ''}
                  onChange={(e) => updateField(['subscriber', 'address', 'postalCode'], e.target.value)}
                  placeholder="ZIP Code"
                  className="p-2 border rounded"
                />
              </div>
              <input
                type="tel"
                value={formData.subscriber?.contactInformation?.phoneNumber ? formatPhoneNumber(formData.subscriber.contactInformation.phoneNumber) : ''}
                onChange={(e) => {
                  if (!formData.subscriber?.contactInformation) {
                    updateField(['subscriber', 'contactInformation'], {});
                  }
                  // Store unformatted digits only
                  const digits = e.target.value.replace(/\D/g, '');
                  updateField(['subscriber', 'contactInformation', 'phoneNumber'], digits);
                }}
                placeholder="Telephone"
                className="w-full p-2 border rounded"
              />
            </div>
          </div>

          {/* Box 11 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">11. INSURED'S POLICY GROUP OR FECA NUMBER</label>
            <input
              type="text"
              value={formData.subscriber?.groupNumber || ''}
              onChange={(e) => updateField(['subscriber', 'groupNumber'], e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>

          {/* Box 11a */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">11a. INSURED'S DATE OF BIRTH</label>
            <div className="flex items-center gap-4">
              <input
                type="date"
                value={formData.subscriber?.dateOfBirth ? formatDateForInput(formData.subscriber.dateOfBirth) : ''}
                onChange={(e) => updateField(['subscriber', 'dateOfBirth'], e.target.value)}
                className="p-2 border rounded"
              />
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold text-[#c41e3a]">SEX</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.subscriber?.gender === 'M'}
                    onChange={() => updateField(['subscriber', 'gender'], 'M')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">M</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.subscriber?.gender === 'F'}
                    onChange={() => updateField(['subscriber', 'gender'], 'F')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">F</span>
                </label>
              </div>
            </div>
          </div>

          {/* Box 11b */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">11b. OTHER CLAIM ID</label>
            <input
              type="text"
              value={formData.claimInformation?.propertyCasualtyClaimNumber || ''}
              onChange={(e) => updateField(['claimInformation', 'propertyCasualtyClaimNumber'], e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>

          {/* Box 11c */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">11c. INSURANCE PLAN NAME</label>
            <input
              type="text"
              value={formData.subscriber?.subscriberGroupName || ''}
              onChange={(e) => updateField(['subscriber', 'subscriberGroupName'], e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>

          {/* Box 11d */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">11d. Is there another health benefit plan?</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={false}
                  disabled
                  className="w-4 h-4"
                />
                <span className="text-sm">YES</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked
                  disabled
                  className="w-4 h-4"
                />
                <span className="text-sm">NO</span>
              </label>
              <span className="text-xs text-gray-500 self-center">Primary commercial claims only</span>
            </div>
          </div>

          {/* Box 8 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">8. RESERVED FOR NUCC USE</label>
            <div className="text-sm text-gray-500 italic">Reserved field</div>
          </div>

          {/* Box 9 */}
          <div className={`pb-3 ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'opacity-50 bg-gray-50' : ''}`}>
            <label className={`text-sm font-bold mb-2 block ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'text-gray-400' : 'text-[#c41e3a]'}`}>
              9. OTHER INSURED'S NAME (Last Name, First Name, Middle Initial)
              {formData.claimInformation?.hasOtherHealthBenefitPlan === false && <span className="ml-2 text-xs text-gray-500">(Disabled - No other health benefit plan)</span>}
            </label>
            <div className="grid grid-cols-3 gap-4">
              <input 
                type="text" 
                placeholder="Last Name" 
                className={`p-2 border rounded ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'bg-gray-100 cursor-not-allowed' : ''}`} 
                disabled={formData.claimInformation?.hasOtherHealthBenefitPlan === false} 
              />
              <input 
                type="text" 
                placeholder="First Name" 
                className={`p-2 border rounded ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'bg-gray-100 cursor-not-allowed' : ''}`} 
                disabled={formData.claimInformation?.hasOtherHealthBenefitPlan === false} 
              />
              <input 
                type="text" 
                placeholder="MI" 
                maxLength={1} 
                className={`p-2 border rounded ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'bg-gray-100 cursor-not-allowed' : ''}`} 
                disabled={formData.claimInformation?.hasOtherHealthBenefitPlan === false} 
              />
            </div>
          </div>

          {/* Box 9a */}
          <div className={`pb-3 ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'opacity-50 bg-gray-50' : ''}`}>
            <label className={`text-sm font-bold mb-2 block ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'text-gray-400' : 'text-[#c41e3a]'}`}>
              9a. OTHER INSURED'S POLICY OR GROUP NUMBER
              {formData.claimInformation?.hasOtherHealthBenefitPlan === false && <span className="ml-2 text-xs text-gray-500">(Disabled - No other health benefit plan)</span>}
            </label>
            <input 
              type="text" 
              className={`w-full p-2 border rounded ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'bg-gray-100 cursor-not-allowed' : ''}`} 
              disabled={formData.claimInformation?.hasOtherHealthBenefitPlan === false} 
            />
          </div>

          {/* Box 9b */}
          <div className={`pb-3 ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'opacity-50 bg-gray-50' : ''}`}>
            <label className={`text-sm font-bold mb-2 block ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'text-gray-400' : 'text-[#c41e3a]'}`}>
              9b. RESERVED FOR NUCC USE
            </label>
            <div className="text-sm text-gray-500 italic">Reserved field</div>
          </div>

          {/* Box 9c */}
          <div className={`pb-3 ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'opacity-50 bg-gray-50' : ''}`}>
            <label className={`text-sm font-bold mb-2 block ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'text-gray-400' : 'text-[#c41e3a]'}`}>
              9c. RESERVED FOR NUCC USE
            </label>
            <div className="text-sm text-gray-500 italic">Reserved field</div>
          </div>

          {/* Box 9d */}
          <div className={`pb-3 ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'opacity-50 bg-gray-50' : ''}`}>
            <label className={`text-sm font-bold mb-2 block ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'text-gray-400' : 'text-[#c41e3a]'}`}>
              9d. INSURANCE PLAN NAME OR PROGRAM NAME
              {formData.claimInformation?.hasOtherHealthBenefitPlan === false && <span className="ml-2 text-xs text-gray-500">(Disabled - No other health benefit plan)</span>}
            </label>
            <input 
              type="text" 
              className={`w-full p-2 border rounded ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'bg-gray-100 cursor-not-allowed' : ''}`} 
              disabled={formData.claimInformation?.hasOtherHealthBenefitPlan === false} 
            />
          </div>

          {/* Box 10 */}
          <div className="pb-3 opacity-60">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">10. IS PATIENT'S CONDITION RELATED TO:</label>
            <p className="text-sm text-gray-600">No — accident, employment, and other conditional claims are outside this form's supported workflow.</p>
          </div>

          {/* Box 10d */}
          <div className="pb-3 opacity-60">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">10d. CLAIM CODES (Designated by NUCC)</label>
            <p className="text-sm text-gray-600">Not applicable to the supported claim type.</p>
          </div>

          {/* Box 12 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">12. PATIENT'S OR AUTHORIZED PERSON'S SIGNATURE</label>
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={patientSignatureOnFile}
                onChange={(e) => setPatientSignatureOnFile(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Signature on File</span>
            </label>
          </div>

          {/* Box 13 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">13. INSURED'S OR AUTHORIZED PERSON'S SIGNATURE</label>
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={authorizedSignatureOnFile}
                onChange={(e) => setAuthorizedSignatureOnFile(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Signature on File</span>
            </label>
          </div>

          {/* Box 14 */}
          <div className="pb-3 opacity-60">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">14. DATE OF CURRENT ILLNESS, INJURY, or PREGNANCY (LMP)</label>
            <p className="text-sm text-gray-600">Not applicable to the supported claim type.</p>
          </div>

          {/* Box 15 */}
          <div className="pb-3 opacity-60">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">15. OTHER DATE</label>
            <p className="text-sm text-gray-600">Not applicable to the supported claim type.</p>
          </div>

          {/* Box 16 */}
          <div className="pb-3 opacity-60">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">16. Dates patient unable to work in current occupation</label>
            <p className="text-sm text-gray-600">Not applicable to the supported claim type.</p>
          </div>

          {/* Box 17 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">17. NAME OF REFERRING PROVIDER OR OTHER SOURCE</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={formData.referring?.firstName || ''}
                onChange={(e) => updateField(['referring', 'firstName'], e.target.value)}
                placeholder="First name"
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                value={formData.referring?.middleName || ''}
                onChange={(e) => updateField(['referring', 'middleName'], e.target.value)}
                placeholder="Middle name"
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                value={formData.referring?.lastName || ''}
                onChange={(e) => updateField(['referring', 'lastName'], e.target.value)}
                placeholder="Last name"
                className="w-full p-2 border rounded"
              />
            </div>
          </div>

          {/* Box 17a */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">17a. OTHER ID</label>
            <input
              type="text"
              value={formData.referring?.commercialNumber || ''}
              onChange={(e) => updateField(['referring', 'commercialNumber'], e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>

          {/* Box 17b */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">17b. NPI</label>
            <input
              type="text"
              value={formData.referring?.npi || ''}
              onChange={(e) => updateField(['referring', 'npi'], e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
              className="w-full p-2 border rounded"
            />
          </div>

          {/* Box 18 */}
          <div className="pb-3 opacity-60">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">18. Hospitalization Dates Related to Current Services</label>
            <p className="text-sm text-gray-600">Not applicable to the supported claim type.</p>
          </div>

          {/* Box 19 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">19. ADDITIONAL CLAIM INFORMATION (Designated by NUCC)</label>
            <input
              type="text"
              value={formData.claimInformation?.claimNote?.additionalInformation || ''}
              onChange={(e) => updateField(['claimInformation', 'claimNote', 'additionalInformation'], e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>

          {/* Box 20 */}
          <div className="pb-3 opacity-60">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">20. OUTSIDE LAB?</label>
            <p className="text-sm text-gray-600">No — outside-lab claims are outside this form's supported workflow.</p>
          </div>

          {/* Box 21 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">21. DIAGNOSIS OR NATURE OF ILLNESS OR INJURY Relate A-L to service line below (24E)</label>
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => (
                <div key={i}>
                  <label className="text-sm font-semibold">{String.fromCharCode(65 + i)}.</label>
                  <input
                    type="text"
                    value={diagnoses[i]?.diagnosisCode || ''}
                    onChange={(e) => updateDiagnosis(i, e.target.value)}
                    className="w-full p-2 border rounded mt-1"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Box 22 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">22. RESUBMISSION CODE</label>
            <div className="grid grid-cols-2 gap-4">
              <select
                value={formData.claimInformation?.claimFrequencyCode || '1'}
                onChange={(e) => updateField(['claimInformation', 'claimFrequencyCode'], e.target.value)}
                className="p-2 border rounded"
              >
                <option value="1">1 - Original claim</option>
                <option value="7">7 - Replacement claim</option>
                <option value="8">8 - Void claim</option>
              </select>
              <input
                type="text"
                value={formData.claimInformation?.claimSupplementalInformation?.claimControlNumber || ''}
                onChange={(e) => updateField(['claimInformation', 'claimSupplementalInformation', 'claimControlNumber'], e.target.value)}
                placeholder="ORIGINAL PAYER CLAIM CONTROL NO."
                disabled={(formData.claimInformation?.claimFrequencyCode || '1') === '1'}
                className={`p-2 border rounded ${(formData.claimInformation?.claimFrequencyCode || '1') === '1' ? 'bg-gray-100 text-gray-500' : ''}`}
              />
            </div>
          </div>

          {/* Box 23 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">23. PRIOR AUTHORIZATION NUMBER</label>
            <input
              type="text"
              value={formData.claimInformation?.claimSupplementalInformation?.priorAuthorizationNumber || ''}
              onChange={(e) => {
                if (!formData.claimInformation?.claimSupplementalInformation) {
                  updateField(['claimInformation', 'claimSupplementalInformation'], {});
                }
                updateField(['claimInformation', 'claimSupplementalInformation', 'priorAuthorizationNumber'], e.target.value);
              }}
              className="w-full p-2 border rounded"
            />
          </div>

          {/* Box 24 - Service Lines */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">
              24. Services
            </label>
            <div className="space-y-3 mt-3">
              {effectiveServiceLines.map((line, index) => (
                <div key={index} className="border border-gray-300 rounded p-3 bg-white relative">
                  {effectiveServiceLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeServiceLine(index)}
                      className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-xl leading-none"
                      aria-label="Remove service line"
                    >
                      ×
                    </button>
                  )}
                  
                  {/* Row 1: Dates, Place, EMG, CPT/HCPCS */}
                  <div className="grid grid-cols-12 gap-2 mb-2">
                    {/* a. FROM */}
                    <div className="col-span-6 sm:col-span-2" style={{ maxWidth: 'calc(100% - 20px)' }}>
                      <label className="text-xs font-semibold text-[#c41e3a] block mb-1 flex items-center gap-1">
                        a. FROM
                        <div className="relative group inline-block">
                          <span className="text-gray-400 cursor-help text-xs">ⓘ</span>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                            <div className="font-semibold mb-1">Date of Service (FROM)</div>
                            <div>The beginning date when the service was provided to the patient.</div>
                            <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </label>
                      <input
                        type="date"
                        value={(() => {
                          const dateStr = line.serviceDate || '';
                          if (!dateStr) return '';
                          const digits = dateStr.replace(/\D/g, '');
                          if (digits.length === 8) {
                            // YYYYMMDD format - convert to YYYY-MM-DD for date picker
                            return `${digits.substring(0, 4)}-${digits.substring(4, 6)}-${digits.substring(6, 8)}`;
                          }
                          if (digits.length === 6) {
                            // MMDDYY format - convert to YYYY-MM-DD (assuming 20XX)
                            const year = `20${digits.substring(4, 6)}`;
                            const month = digits.substring(0, 2);
                            const day = digits.substring(2, 4);
                            return `${year}-${month}-${day}`;
                          }
                          return '';
                        })()}
                        onChange={(e) => {
                          const dateValue = e.target.value;
                          if (dateValue) {
                            // Convert YYYY-MM-DD to YYYYMMDD for API
                            const apiDate = dateValue.replace(/-/g, '');
                            const sl = [...effectiveServiceLines];
                            sl[index] = {
                              ...sl[index],
                              serviceDate: apiDate
                            };
                            updateField(['claimInformation', 'serviceLines'], sl);
                          } else {
                            const sl = [...effectiveServiceLines];
                            sl[index] = {
                              ...sl[index],
                              serviceDate: ''
                            };
                            updateField(['claimInformation', 'serviceLines'], sl);
                          }
                        }}
                        className="w-full px-1.5 py-1.5 border rounded text-sm"
                      />
                    </div>

                    {/* a. TO */}
                    <div className="col-span-6 sm:col-span-2" style={{ maxWidth: 'calc(100% - 20px)' }}>
                      <label className="text-xs font-semibold text-[#c41e3a] block mb-1 flex items-center gap-1">
                        TO
                        <div className="relative group inline-block">
                          <span className="text-gray-400 cursor-help text-xs">ⓘ</span>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                            <div className="font-semibold mb-1">Date of Service (TO)</div>
                            <div>The ending date when the service was provided. Leave blank if same as FROM.</div>
                            <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </label>
                      <input
                        type="date"
                        value={(() => {
                          const dateStr = line.serviceDateEnd || '';
                          if (!dateStr) return '';
                          const digits = dateStr.replace(/\D/g, '');
                          if (digits.length === 8) {
                            // YYYYMMDD format - convert to YYYY-MM-DD for date picker
                            return `${digits.substring(0, 4)}-${digits.substring(4, 6)}-${digits.substring(6, 8)}`;
                          }
                          if (digits.length === 6) {
                            // MMDDYY format - convert to YYYY-MM-DD (assuming 20XX)
                            const year = `20${digits.substring(4, 6)}`;
                            const month = digits.substring(0, 2);
                            const day = digits.substring(2, 4);
                            return `${year}-${month}-${day}`;
                          }
                          return '';
                        })()}
                        onChange={(e) => {
                          const dateValue = e.target.value;
                          if (dateValue) {
                            // Convert YYYY-MM-DD to YYYYMMDD for API
                            const apiDate = dateValue.replace(/-/g, '');
                            const sl = [...effectiveServiceLines];
                            sl[index] = {
                              ...sl[index],
                              serviceDateEnd: apiDate
                            };
                            updateField(['claimInformation', 'serviceLines'], sl);
                          } else {
                            const sl = [...effectiveServiceLines];
                            sl[index] = {
                              ...sl[index],
                              serviceDateEnd: ''
                            };
                            updateField(['claimInformation', 'serviceLines'], sl);
                          }
                        }}
                        className="w-full px-1.5 py-1.5 border rounded text-sm"
                      />
                    </div>

                    {/* b. Place of Service */}
                    <div className="col-span-3 sm:col-span-1">
                      <label className="text-xs font-semibold text-[#c41e3a] block mb-1 flex items-center gap-1">
                        b. POS
                        <div className="relative group inline-block">
                          <span className="text-gray-400 cursor-help text-xs">ⓘ</span>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                            <div className="font-semibold mb-1">Place of Service</div>
                            <div>2-digit code indicating where the service was performed (e.g., 11=Office, 21=Inpatient Hospital).</div>
                            <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </label>
                      <input
                        type="text"
                        value={line.professionalService?.placeOfServiceCode || formData.claimInformation?.placeOfServiceCode || '10'}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 2);
                          updateServiceLine(index, 'professionalService.placeOfServiceCode', value);
                        }}
                        placeholder="##"
                        maxLength={2}
                        className="w-full p-1.5 border rounded text-sm text-center"
                      />
                    </div>

                    {/* c. EMG */}
                    <div className="col-span-3 sm:col-span-1">
                      <label className="text-xs font-semibold text-[#c41e3a] block mb-1 flex items-center gap-1">
                        c. EMG
                        <div className="relative group inline-block">
                          <span className="text-gray-400 cursor-help text-xs">ⓘ</span>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                            <div className="font-semibold mb-1">Emergency Indicator</div>
                            <div>Check if service was provided in an emergency situation.</div>
                            <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </label>
                      <div className="flex items-center justify-center h-9">
                        <input
                          type="checkbox"
                          checked={line.professionalService?.emergencyIndicator === 'Y'}
                          onChange={(e) => {
                            const sl = [...effectiveServiceLines];
                            sl[index] = {
                              ...sl[index],
                              professionalService: {
                                ...sl[index].professionalService,
                                emergencyIndicator: e.target.checked ? 'Y' : undefined
                              }
                            };
                            updateField(['claimInformation', 'serviceLines'], sl);
                          }}
                          className="w-4 h-4 text-[#9e32e2] border-gray-300 rounded focus:ring-[#9e32e2]"
                        />
                      </div>
                    </div>

                    {/* d. CPT/HCPCS */}
                    <div className="col-span-6 sm:col-span-3">
                      <label className="text-xs font-semibold text-[#c41e3a] block mb-1 flex items-center gap-1">
                        d. CPT/HCPCS
                        <div className="relative group inline-block">
                          <span className="text-gray-400 cursor-help text-xs">ⓘ</span>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                            <div className="font-semibold mb-1">Procedure Code</div>
                            <div>The CPT or HCPCS code identifying the medical procedure or service provided.</div>
                            <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </label>
                      <input
                        type="text"
                        value={line.professionalService?.procedureCode || ''}
                        onChange={(e) => {
                          const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                          updateServiceLine(index, 'professionalService.procedureCode', value);
                        }}
                        placeholder="Code"
                        maxLength={6}
                        className="w-full p-1.5 border rounded text-sm"
                      />
                    </div>

                    {/* d. Modifier */}
                    <div className="col-span-6 sm:col-span-1">
                      <label className="text-xs font-semibold text-[#c41e3a] block mb-1 flex items-center gap-1">
                        Modifier
                        <div className="relative group inline-block">
                          <span className="text-gray-400 cursor-help text-xs">ⓘ</span>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                            <div className="font-semibold mb-1">Procedure Modifier</div>
                            <div>2-digit code that provides additional information about the procedure performed.</div>
                            <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </label>
                      <input
                        type="text"
                        value={(line.professionalService?.procedureModifiers || []).join(' ')}
                        onChange={(e) => {
                          const modifiers = e.target.value
                            .toUpperCase()
                            .split(/[\s,]+/)
                            .map((value) => value.replace(/[^A-Z0-9]/g, '').slice(0, 2))
                            .filter(Boolean)
                            .slice(0, 4);
                          const sl = [...effectiveServiceLines];
                          sl[index] = {
                            ...sl[index],
                            professionalService: {
                              ...sl[index].professionalService,
                              procedureModifiers: modifiers.length > 0 ? modifiers : undefined
                            }
                          };
                          updateField(['claimInformation', 'serviceLines'], sl);
                        }}
                        placeholder="95 GT"
                        maxLength={11}
                        className="w-full p-1.5 border rounded text-sm"
                      />
                    </div>

                    {/* e. Diagnosis Pointer */}
                    <div className="col-span-6 sm:col-span-2">
                      <label className="text-xs font-semibold text-[#c41e3a] block mb-1 flex items-center gap-1">
                        e. Dx
                        <div className="relative group inline-block">
                          <span className="text-gray-400 cursor-help text-xs">ⓘ</span>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                            <div className="font-semibold mb-1">Diagnosis Pointer</div>
                            <div>Letter (A-L) linking this service to the corresponding diagnosis code in Box 21.</div>
                            <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </label>
                      <input
                        type="text"
                        value={(line.professionalService?.compositeDiagnosisCodePointers?.diagnosisCodePointers || [])
                          .map(diagnosisPointerForDisplay)
                          .join('')}
                        onChange={(e) => {
                          const pointers = e.target.value
                            .toUpperCase()
                            .replace(/[^A-L]/g, '')
                            .slice(0, 4)
                            .split('');
                          const sl = [...effectiveServiceLines];
                          sl[index] = {
                            ...sl[index],
                            professionalService: {
                              ...sl[index].professionalService,
                              compositeDiagnosisCodePointers: {
                                diagnosisCodePointers: pointers
                              }
                            }
                          };
                          updateField(['claimInformation', 'serviceLines'], sl);
                        }}
                        placeholder="A"
                        maxLength={4}
                        className="w-full p-1.5 border rounded text-sm"
                      />
                    </div>
                  </div>

                  {/* Row 2: Charges, Units, EPSDT, ID Qual, Provider ID */}
                  <div className="grid grid-cols-12 gap-2">
                    {/* f. Charges */}
                    <div className="col-span-6 sm:col-span-3">
                      <label className="text-xs font-semibold text-[#c41e3a] block mb-1 flex items-center gap-1">
                        f. Charges
                        <div className="relative group inline-block">
                          <span className="text-gray-400 cursor-help text-xs">ⓘ</span>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                            <div className="font-semibold mb-1">Line Item Charge Amount</div>
                            <div>The total charge amount for this specific service line before any adjustments.</div>
                            <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-xs">$</span>
                        <input
                          type="text"
                          value={line.professionalService?.lineItemChargeAmount ? formatCurrency(line.professionalService.lineItemChargeAmount) : ''}
                          onChange={(e) => {
                            const cents = parseCurrencyToCents(e.target.value);
                            updateServiceLine(index, 'professionalService.lineItemChargeAmount', cents);
                          }}
                          placeholder="0.00"
                          className="flex-1 p-1.5 border rounded text-sm"
                        />
                      </div>
                    </div>

                    {/* g. Days or Units */}
                    <div className="col-span-6 sm:col-span-2">
                      <label className="text-xs font-semibold text-[#c41e3a] block mb-1 flex items-center gap-1">
                        g. Units
                        <div className="relative group inline-block">
                          <span className="text-gray-400 cursor-help text-xs">ⓘ</span>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                            <div className="font-semibold mb-1">Days or Units</div>
                            <div>The number of times the service was performed or the number of days/units billed.</div>
                            <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </label>
                      <input
                        type="text"
                        value={line.professionalService?.serviceUnitCount || ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^\d.]/g, '');
                          if (/^\d{0,3}(\.\d{0,3})?$/.test(value)) {
                            updateServiceLine(index, 'professionalService.serviceUnitCount', value);
                          }
                        }}
                        placeholder="1"
                        maxLength={7}
                        className="w-full p-1.5 border rounded text-sm text-center"
                      />
                    </div>

                    {/* h. EPSDT */}
                    <div className="col-span-4 sm:col-span-1">
                      <label className="text-xs font-semibold text-[#c41e3a] block mb-1 flex items-center gap-1">
                        h. EP
                        <div className="relative group inline-block">
                          <span className="text-gray-400 cursor-help text-xs">ⓘ</span>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                            <div className="font-semibold mb-1">EPSDT Family Plan</div>
                            <div>Early and Periodic Screening, Diagnostic and Treatment indicator for Medicaid patients.</div>
                            <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </label>
                      <input
                        type="text"
                        value={line.professionalService?.epsdtIndicator || ''}
                        onChange={(e) => {
                          const value = e.target.value.toUpperCase().replace(/[^Y]/g, '').slice(0, 1);
                          const sl = [...effectiveServiceLines];
                          sl[index] = {
                            ...sl[index],
                            professionalService: {
                              ...sl[index].professionalService,
                              epsdtIndicator: value === 'Y' ? 'Y' : undefined
                            }
                          };
                          updateField(['claimInformation', 'serviceLines'], sl);
                        }}
                        maxLength={1}
                        placeholder="N"
                        className="w-full p-1.5 border rounded text-sm text-center"
                      />
                    </div>

                    {/* i. ID. Qual */}
                    <div className="col-span-4 sm:col-span-2">
                      <label className="text-xs font-semibold text-[#c41e3a] block mb-1 flex items-center gap-1">
                        i. Qual
                        <div className="relative group inline-block">
                          <span className="text-gray-400 cursor-help text-xs">ⓘ</span>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                            <div className="font-semibold mb-1">ID Qualifier</div>
                            <div>Identifies the type of provider identifier being used (typically NPI - National Provider Identifier).</div>
                            <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </label>
                      <select
                        value="NPI"
                        className="w-full p-1.5 border rounded text-sm bg-gray-50"
                        disabled
                      >
                        <option value="NPI">NPI</option>
                      </select>
                    </div>

                    {/* j. Rendering Provider ID */}
                    <div className="col-span-12 sm:col-span-4">
                      <label className="text-xs font-semibold text-[#c41e3a] block mb-1 flex items-center gap-1">
                        j. Rendering Provider ID
                        <div className="relative group inline-block">
                          <span className="text-gray-400 cursor-help text-xs">ⓘ</span>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                            <div className="font-semibold mb-1">Rendering Provider NPI</div>
                            <div>The National Provider Identifier for the healthcare professional who performed the service.</div>
                            <div className="absolute top-full left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </label>
                      <input
                        type="text"
                        value={line.renderingProvider?.npi || ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                          const sl = [...effectiveServiceLines];
                          sl[index] = {
                            ...sl[index],
                            renderingProvider: {
                              ...sl[index].renderingProvider,
                              providerType: 'RenderingProvider',
                              npi: value
                            }
                          };
                          updateField(['claimInformation', 'serviceLines'], sl);
                        }}
                        placeholder="NPI (10 digits)"
                        maxLength={10}
                        className="w-full p-1.5 border rounded text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                    <input
                      type="text"
                      value={line.renderingProvider?.firstName || ''}
                      onChange={(e) => {
                        const sl = [...effectiveServiceLines];
                        sl[index] = {
                          ...sl[index],
                          renderingProvider: {
                            ...sl[index].renderingProvider,
                            providerType: 'RenderingProvider',
                            firstName: e.target.value
                          }
                        };
                        updateField(['claimInformation', 'serviceLines'], sl);
                      }}
                      placeholder="Rendering provider first name"
                      className="p-1.5 border rounded text-sm"
                    />
                    <input
                      type="text"
                      value={line.renderingProvider?.lastName || ''}
                      onChange={(e) => {
                        const sl = [...effectiveServiceLines];
                        sl[index] = {
                          ...sl[index],
                          renderingProvider: {
                            ...sl[index].renderingProvider,
                            providerType: 'RenderingProvider',
                            lastName: e.target.value
                          }
                        };
                        updateField(['claimInformation', 'serviceLines'], sl);
                      }}
                      placeholder="Rendering provider last name"
                      className="p-1.5 border rounded text-sm"
                    />
                    <input
                      type="text"
                      value={line.renderingProvider?.taxonomyCode || ''}
                      onChange={(e) => {
                        const sl = [...effectiveServiceLines];
                        sl[index] = {
                          ...sl[index],
                          renderingProvider: {
                            ...sl[index].renderingProvider,
                            providerType: 'RenderingProvider',
                            taxonomyCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
                          }
                        };
                        updateField(['claimInformation', 'serviceLines'], sl);
                      }}
                      placeholder="Rendering taxonomy"
                      maxLength={10}
                      className="p-1.5 border rounded text-sm"
                    />
                  </div>
                </div>
              ))}
              {effectiveServiceLines.length < 6 && (
                <button
                  type="button"
                  onClick={addServiceLine}
                  className="w-full px-3 py-2 bg-[#9e32e2] text-white rounded hover:bg-[#8a2bc9] text-sm font-semibold"
                >
                  + Add Service Line
                </button>
              )}
            </div>
          </div>

          {/* Box 25 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">25. FEDERAL TAX I.D. NUMBER</label>
            <div className="space-y-2">
              <div className="flex gap-4 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.billing?.taxIdType === 'SSN'}
                    onChange={(e) => {
                      if (e.target.checked) {
                        updateField(['billing', 'taxIdType'], 'SSN');
                        updateField(['billing', 'employerId'], undefined);
                      } else {
                        updateField(['billing', 'taxIdType'], undefined);
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">SSN</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.billing?.taxIdType === 'EIN' || (!formData.billing?.taxIdType)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        updateField(['billing', 'taxIdType'], 'EIN');
                        updateField(['billing', 'ssn'], undefined);
                      } else {
                        updateField(['billing', 'taxIdType'], undefined);
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">EIN</span>
                </label>
              </div>
              <div>
                {(formData.billing?.taxIdType === 'EIN' || !formData.billing?.taxIdType) ? (
                  <>
                  <input
                    type="text"
                    list="billing-ein-options"
                    value={formData.billing?.employerId || ''}
                    onChange={(e) => updateField(['billing', 'employerId'], e.target.value.replace(/\D/g, '').slice(0, 9))}
                    placeholder="9-digit EIN"
                    maxLength={9}
                    className={`w-full p-2 border rounded ${formData.billing?.employerId && !validateSSN(formData.billing.employerId) ? 'border-red-500' : ''}`}
                  />
                  <datalist id="billing-ein-options">
                    <option value="994567305">RHMG, PLLC</option>
                    <option value="394343101">RHMG, LLC - NJ</option>
                    <option value="394724400">Alexander Marsh, M.D., PC</option>
                  </datalist>
                  </>
                ) : (
                  <input
                    type="text"
                    value={formData.billing?.ssn ? formatSSN(formData.billing.ssn) : ''}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      // Limit to 9 digits
                      const limited = digits.slice(0, 9);
                      updateField(['billing', 'ssn'], limited);
                    }}
                    className={`w-full p-2 border rounded ${
                      formData.billing?.ssn && !validateSSN(formData.billing.ssn)
                        ? 'border-red-500'
                        : ''
                    }`}
                    placeholder={formData.billing?.taxIdType === 'SSN' ? 'XXX-XX-XXXX' : 'Enter Tax ID'}
                  />
                )}
                {formData.billing?.taxIdType === 'SSN' && formData.billing?.ssn && !validateSSN(formData.billing.ssn) && (
                  <p className="text-xs text-red-500 mt-1">SSN must be 9 digits</p>
                )}
                {(formData.billing?.taxIdType === 'EIN' || !formData.billing?.taxIdType) && formData.billing?.employerId && !validateSSN(formData.billing.employerId) && (
                  <p className="text-xs text-red-500 mt-1">EIN must be 9 digits</p>
                )}
              </div>
            </div>
          </div>

          {/* Box 26 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">26. PATIENT'S ACCOUNT NO.</label>
            <input
              type="text"
              value={formData.claimInformation?.patientControlNumber || ''}
              onChange={(e) => updateField(['claimInformation', 'patientControlNumber'], e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>

          {/* Box 27 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">27. ACCEPT ASSIGNMENT?</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.claimInformation?.planParticipationCode === 'A'}
                  onChange={(e) => {
                    if (e.target.checked) {
                      updateField(['claimInformation', 'planParticipationCode'], 'A');
                    }
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm">YES</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.claimInformation?.planParticipationCode === 'C'}
                  onChange={(e) => {
                    if (e.target.checked) {
                      updateField(['claimInformation', 'planParticipationCode'], 'C');
                    }
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm">NO</span>
              </label>
            </div>
          </div>

          {/* Box 28 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">28. TOTAL CHARGE</label>
            <div className="flex items-center gap-2">
              <span className="text-sm">$</span>
              <input
                type="text"
                value={formData.claimInformation?.claimChargeAmount ? formatCurrency(formData.claimInformation.claimChargeAmount) : '0.00'}
                readOnly
                placeholder="0.00"
                className="w-full p-2 border rounded bg-gray-50 cursor-not-allowed"
                title="Auto-calculated from service line charges"
              />
            </div>
          </div>

          {/* Box 29 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">29. AMOUNT PAID</label>
            <div className="flex items-center gap-2">
              <span className="text-sm">$</span>
              <input
                type="text"
                value={formData.claimInformation?.patientAmountPaid ? formatCurrency(formData.claimInformation.patientAmountPaid) : ''}
                onChange={(e) => {
                  const cents = parseCurrencyToCents(e.target.value);
                  updateField(['claimInformation', 'patientAmountPaid'], cents);
                }}
                placeholder="0.00"
                className="w-full p-2 border rounded"
              />
            </div>
          </div>

          {/* Box 30 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">30. Rsvd for NUCC Use</label>
            <div className="text-sm text-gray-500 italic">Reserved field</div>
          </div>

          {/* Box 31 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">31. SIGNATURE OF PHYSICIAN OR SUPPLIER</label>
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={physicianSignatureOnFile}
                onChange={(e) => setPhysicianSignatureOnFile(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Signature on File</span>
            </label>
          </div>

          {/* Box 32 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">32. SERVICE FACILITY LOCATION INFORMATION</label>
            <div className="space-y-2">
              <input
                type="text"
                value={formData.claimInformation?.serviceFacilityLocation?.organizationName || formData.billing?.organizationName || ''}
                onChange={(e) => {
                  if (!formData.claimInformation?.serviceFacilityLocation) {
                    updateField(['claimInformation', 'serviceFacilityLocation'], {});
                  }
                  updateField(['claimInformation', 'serviceFacilityLocation', 'organizationName'], e.target.value);
                }}
                placeholder="Company Name"
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                value={formData.claimInformation?.serviceFacilityLocation?.address?.address1 || ''}
                onChange={(e) => updateField(['claimInformation', 'serviceFacilityLocation', 'address', 'address1'], e.target.value)}
                placeholder="Street Address"
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                value={formData.claimInformation?.serviceFacilityLocation?.address?.address2 || ''}
                onChange={(e) => updateField(['claimInformation', 'serviceFacilityLocation', 'address', 'address2'], e.target.value)}
                placeholder="Address Line 2"
                className="w-full p-2 border rounded"
              />
              <div className="grid grid-cols-3 gap-4">
                <input
                  type="text"
                  value={formData.claimInformation?.serviceFacilityLocation?.address?.city || ''}
                  onChange={(e) => updateField(['claimInformation', 'serviceFacilityLocation', 'address', 'city'], e.target.value)}
                  placeholder="City"
                  className="p-2 border rounded"
                />
                <input
                  type="text"
                  value={formData.claimInformation?.serviceFacilityLocation?.address?.state || ''}
                  onChange={(e) => updateField(['claimInformation', 'serviceFacilityLocation', 'address', 'state'], e.target.value.toUpperCase())}
                  placeholder="State"
                  maxLength={2}
                  className="p-2 border rounded uppercase"
                />
                <input
                  type="text"
                  value={formData.claimInformation?.serviceFacilityLocation?.address?.postalCode || ''}
                  onChange={(e) => updateField(['claimInformation', 'serviceFacilityLocation', 'address', 'postalCode'], e.target.value.replace(/\D/g, '').slice(0, 9))}
                  placeholder="ZIP Code"
                  className="p-2 border rounded"
                />
              </div>
              <input
                type="text"
                maxLength={10}
                value={formData.claimInformation?.serviceFacilityLocation?.npi || ''}
                onChange={(e) => {
                  if (!formData.claimInformation?.serviceFacilityLocation) {
                    updateField(['claimInformation', 'serviceFacilityLocation'], {});
                  }
                  updateField(['claimInformation', 'serviceFacilityLocation', 'npi'], e.target.value.replace(/\D/g, '').slice(0, 10));
                }}
                placeholder="NPI"
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                value={formData.claimInformation?.serviceFacilityLocation?.phoneName || ''}
                onChange={(e) => updateField(['claimInformation', 'serviceFacilityLocation', 'phoneName'], e.target.value)}
                placeholder="Facility Contact Name"
                className="w-full p-2 border rounded"
              />
              <input
                type="tel"
                value={formData.claimInformation?.serviceFacilityLocation?.phoneNumber ? formatPhoneNumber(formData.claimInformation.serviceFacilityLocation.phoneNumber) : ''}
                onChange={(e) => {
                  updateField(['claimInformation', 'serviceFacilityLocation', 'phoneNumber'], e.target.value.replace(/\D/g, ''));
                }}
                placeholder="Facility Phone Number"
                className="w-full p-2 border rounded"
              />
            </div>
          </div>

          {/* Box 33 */}
          <div className="pb-3">
            <label className="text-sm font-bold text-[#c41e3a] mb-2 block">33. BILLING PROVIDER INFO & PH #</label>
            <div className="space-y-2">
              <input
                type="text"
                value={formData.billing?.organizationName || ''}
                onChange={(e) => updateField(['billing', 'organizationName'], e.target.value)}
                placeholder="Name"
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                value={formData.billing?.address?.address1 || ''}
                onChange={(e) => updateField(['billing', 'address', 'address1'], e.target.value)}
                placeholder="Address"
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                value={formData.billing?.address?.address2 || ''}
                onChange={(e) => updateField(['billing', 'address', 'address2'], e.target.value)}
                placeholder="Address Line 2"
                className="w-full p-2 border rounded"
              />
              <div className="grid grid-cols-3 gap-4">
                <input
                  type="text"
                  value={formData.billing?.address?.city || ''}
                  onChange={(e) => updateField(['billing', 'address', 'city'], e.target.value)}
                  placeholder="City"
                  className="p-2 border rounded"
                />
                <input
                  type="text"
                  value={formData.billing?.address?.state || ''}
                  onChange={(e) => updateField(['billing', 'address', 'state'], e.target.value.toUpperCase())}
                  placeholder="ST"
                  maxLength={2}
                  className="p-2 border rounded uppercase"
                />
                <input
                  type="text"
                  value={formData.billing?.address?.postalCode || ''}
                  onChange={(e) => updateField(['billing', 'address', 'postalCode'], e.target.value.replace(/\D/g, '').slice(0, 9))}
                  placeholder="ZIP"
                  className="p-2 border rounded"
                />
              </div>
              <input
                type="text"
                value={formData.billing?.contactInformation?.name || ''}
                onChange={(e) => updateField(['billing', 'contactInformation', 'name'], e.target.value)}
                placeholder="Billing Contact Name"
                className="w-full p-2 border rounded"
              />
              <input
                type="tel"
                value={formData.billing?.contactInformation?.phoneNumber ? formatPhoneNumber(formData.billing.contactInformation.phoneNumber) : ''}
                onChange={(e) => {
                  if (!formData.billing?.contactInformation) {
                    updateField(['billing', 'contactInformation'], {});
                  }
                  // Store unformatted digits only
                  const digits = e.target.value.replace(/\D/g, '');
                  updateField(['billing', 'contactInformation', 'phoneNumber'], digits);
                }}
                placeholder="Phone Number"
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                value={formData.billing?.npi || ''}
                onChange={(e) => updateField(['billing', 'npi'], e.target.value.replace(/\D/g, '').slice(0, 10))}
                maxLength={10}
                placeholder="NPI"
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                value={formData.billing?.taxonomyCode || ''}
                onChange={(e) => updateField(['billing', 'taxonomyCode'], e.target.value.toUpperCase().slice(0, 10))}
                maxLength={10}
                placeholder="Taxonomy Code (required)"
                className="w-full p-2 border rounded"
              />
              <input
                type="email"
                value={formData.billing?.contactInformation?.email || ''}
                onChange={(e) => updateField(['billing', 'contactInformation', 'email'], e.target.value)}
                placeholder="Billing Contact Email"
                className="w-full p-2 border rounded"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-gray-600 mt-6">
            NUCC Instruction Manual available at: www.nucc.org &nbsp;&nbsp;&nbsp; PLEASE PRINT OR TYPE &nbsp;&nbsp;&nbsp; APPROVED OMB-0938-1197 FORM 1500 (02-12)
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 mt-6">
            <button
              type="button"
              onClick={handleValidate}
              disabled={loading}
              className={`flex-1 px-6 py-3 rounded-md font-semibold ${
                loading && actionType === 'validate'
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              } text-white disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading && actionType === 'validate' ? 'Validating...' : 'Validate Claim'}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className={`flex-1 px-6 py-3 rounded-md font-semibold ${
                loading && actionType === 'submit'
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-[#9e32e2] hover:bg-[#8a2bc9]'
              } text-white disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading && actionType === 'submit' ? 'Submitting...' : 'Submit Claim'}
            </button>
          </div>
        </div>
      </div>

      {/* Results Section */}
      {(loading || response || error) && (
        <div className="mt-6 w-full">
          {loading ? (
            <div className="bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 p-8 flex items-center justify-center">
              <div className="text-center text-gray-500 space-y-4">
                <div className="flex justify-center">
                  <svg className="animate-spin h-12 w-12 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-medium text-gray-700">
                    {actionType === 'validate' ? 'Validating claim...' : 'Submitting claim...'}
                  </p>
                  <p className="text-sm text-gray-500">Results will appear here</p>
                </div>
              </div>
            </div>
          ) : (response || error) ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <ClaimResponseDisplay
                request={lastRequest}
                response={response}
                error={error}
                onGeneratePDF={handleGeneratePDF}
              />
            </div>
          ) : null}
        </div>
      )}

      {/* Payer API Request/Response Modal */}
      {showPayerModal && payersApiRequest && (
        <ApiResponseModal
          isOpen={showPayerModal}
          onClose={() => setShowPayerModal(false)}
          title="PayerList v1 API - Export Request/Response"
          request={payersApiRequest}
          response={payersApiResponse}
        />
      )}
    </div>
  );
}

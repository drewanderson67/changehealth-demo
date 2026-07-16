import { useState, useEffect } from 'react';
import type {
  ClaimSubmissionRequest,
  ServiceLine,
  ClaimResponse,
  Provider,
  Subscriber,
  Dependent,
  ServiceFacilityLocation,
  Address
} from '../types/claims';
import type { Environment } from '../types/eligibility';
import { validateClaim, submitClaim, generateClaimPDF } from '../services/claimsApi';
import providerOptionsData from '../data/providerOptions.json';
import ClaimResponseDisplay from './ClaimResponseDisplay';
import EnvironmentSelector from './EnvironmentSelector';

interface Props {
  environment: Environment;
  onEnvironmentChange?: (env: Environment) => void;
}

const STORAGE_KEY_FORM_DATA = 'optum-claim-form-data';
const STORAGE_KEY_USAGE_INDICATOR = 'optum-claim-usage-indicator';
const STORAGE_KEY_PHYSICIAN_SIGNATURE_DATE = 'optum-claim-physician-signature-date';
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
};

const PROVIDER_OPTIONS = providerOptionsData as ProviderOption[];
const REPERIO_BILLING_ADDRESS = {
  address1: '4784 SE 17th Avenue',
  address2: 'Suite 125',
  city: 'Portland',
  state: 'OR',
  postalCode: '97202'
};
const REPERIO_BILLING_PHONE = '5038945310';
const REPERIO_BILLING_EMAIL = 'claims@reperiohealth.com';
const REPERIO_BILLING_CONTACT_NAME = 'Claims Support';
const REPERIO_DEFAULT_CLIA_NUMBER = '38D2340402';

/**
 * OPTUM SANDBOX EXCEPTION — NEVER USE THESE VALUES IN PRODUCTION.
 *
 * Optum's Claims sandbox is a canned-response environment. It rejects real or
 * invented patient/provider identity values before it evaluates the request and
 * requires the pseudo-data published here:
 * https://developer.optum.com/eligibilityandclaims/docs/sandbox-predefined-fields-and-values
 *
 * Keeping the fixture together makes the production boundary obvious to anyone
 * using this prototype as an implementation reference. Production requests must
 * continue to use the patient, payer, and Reperio provider values collected by
 * the application.
 */
const OPTUM_SANDBOX_FIXTURE = {
  controlNumber: '000000001',
  payerId: '9496',
  payerName: 'EXTRA HEALTHY INSURANCE',
  patientControlNumber: '12345',
  submitter: {
    organizationName: 'REGIONAL PPO NETWORK',
    contactName: 'SUBMITTER CONTACT INFO',
    phoneNumber: '123456789',
    email: 'email@email.com'
  },
  subscriber: {
    memberId: '0000000001',
    firstName: 'johnone',
    lastName: 'doeOne',
    gender: 'M' as const,
    dateOfBirth: '19800102',
    policyNumber: '00001',
    groupNumber: '0000000001',
    phoneNumber: '0000000001',
    address: {
      address1: '123 address1',
      city: 'city1',
      state: 'wa',
      postalCode: '981010000'
    }
  },
  spouse: {
    memberId: '0000000002',
    firstName: 'janeone',
    lastName: 'doeOne',
    gender: 'F' as const,
    dateOfBirth: '19800102',
    address: {
      address1: '123 address1',
      city: 'city1',
      state: 'wa',
      postalCode: '981010000'
    }
  },
  billing: {
    organizationName: 'HAPPY DOCTORS GROUPPRACTICE',
    npi: '1760854442',
    employerId: '123456789',
    contactName: 'janetwo doetwo',
    phoneNumber: '0000000001',
    email: 'email@email.com',
    address: {
      address1: '000 address1',
      address2: 'apt 000',
      city: 'city2',
      state: 'tn',
      postalCode: '372030000'
    }
  },
  serviceFacility: {
    organizationName: 'HAPPY DOCTORS GROUP',
    npi: '1760854442',
    address: {
      address1: '000 address1',
      city: 'city2',
      state: 'tn',
      postalCode: '372030000'
    }
  }
};

const OPTUM_SANDBOX_PATIENT_CONTROL_NUMBERS = new Set(['00000', '12345', '00001', '00002']);

function createOptumSandboxSubscriber(includePatientMemberId = true): Subscriber {
  const fixture = OPTUM_SANDBOX_FIXTURE.subscriber;
  return {
    paymentResponsibilityLevelCode: 'P',
    memberId: includePatientMemberId ? fixture.memberId : undefined,
    firstName: fixture.firstName,
    lastName: fixture.lastName,
    gender: fixture.gender,
    dateOfBirth: fixture.dateOfBirth,
    policyNumber: fixture.policyNumber,
    groupNumber: fixture.groupNumber,
    address: { ...fixture.address },
    contactInformation: {
      name: `${fixture.firstName} ${fixture.lastName}`,
      phoneNumber: fixture.phoneNumber
    }
  };
}

function createOptumSandboxSpouse(): Dependent {
  const fixture = OPTUM_SANDBOX_FIXTURE.spouse;
  return {
    memberId: fixture.memberId,
    firstName: fixture.firstName,
    lastName: fixture.lastName,
    gender: fixture.gender,
    dateOfBirth: fixture.dateOfBirth,
    relationshipToSubscriberCode: '01',
    address: { ...fixture.address }
  };
}

const DEFAULT_DIAGNOSES = [
  { diagnosisTypeCode: 'ABK', diagnosisCode: 'Z00.00' },
  { diagnosisTypeCode: 'ABF', diagnosisCode: 'Z13.31' },
  { diagnosisTypeCode: 'ABF', diagnosisCode: 'Z13.39' },
  { diagnosisTypeCode: 'ABF', diagnosisCode: 'Z13.220' },
  { diagnosisTypeCode: 'ABF', diagnosisCode: 'Z13.1' }
];

type ProcedureOption = {
  code: string;
  label: string;
  hint: string;
  modifiers: string[];
};

const PROCEDURE_OPTIONS: ProcedureOption[] = [
  {
    code: '99385',
    label: '99385 — New preventive visit, age 18–39',
    hint: 'Use when the patient is 18–39 and has not had a Reperio visit in the past 3 years.',
    modifiers: ['95']
  },
  {
    code: '99386',
    label: '99386 — New preventive visit, age 40–64',
    hint: 'Use when the patient is 40–64 and has not had a Reperio visit in the past 3 years.',
    modifiers: ['95']
  },
  {
    code: '99387',
    label: '99387 — New preventive visit, age 65+',
    hint: 'Use when the patient is 65 or older and has not had a Reperio visit in the past 3 years.',
    modifiers: ['95']
  },
  {
    code: '99395',
    label: '99395 — Established preventive visit, age 18–39',
    hint: 'Use when the patient is 18–39 and has had a Reperio visit in the past 3 years.',
    modifiers: ['95']
  },
  {
    code: '99396',
    label: '99396 — Established preventive visit, age 40–64',
    hint: 'Use when the patient is 40–64 and has had a Reperio visit in the past 3 years.',
    modifiers: ['95']
  },
  {
    code: '99397',
    label: '99397 — Established preventive visit, age 65+',
    hint: 'Use when the patient is 65 or older and has had a Reperio visit in the past 3 years.',
    modifiers: ['95']
  },
  {
    code: '96127',
    label: '96127 — PHQ-9 or GAD-7 screening',
    hint: 'Use for a brief emotional or behavioral assessment such as PHQ-9 or GAD-7.',
    modifiers: []
  },
  {
    code: '80061',
    label: '80061 — Lipid panel',
    hint: 'Lipid panel; the QW modifier is selected automatically.',
    modifiers: ['QW']
  },
  {
    code: '82947',
    label: '82947 — Glucose',
    hint: 'Glucose test; the QW modifier is selected automatically.',
    modifiers: ['QW']
  },
  {
    code: '99202',
    label: '99202 — Problem-oriented E/M',
    hint: 'Problem-oriented evaluation and management; modifiers 25 and 95 are selected automatically.',
    modifiers: ['25', '95']
  }
];

const DEFAULT_SERVICE_LINE_TEMPLATES = [
  { code: '99386', modifiers: ['95'], pointers: ['1'], charge: '20000', requiresClia: false },
  { code: '96127', modifiers: [], pointers: ['2'], charge: '2500', requiresClia: false },
  { code: '96127', modifiers: [], pointers: ['3'], charge: '2500', requiresClia: false },
  { code: '80061', modifiers: ['QW'], pointers: ['4'], charge: '4500', requiresClia: true },
  { code: '82947', modifiers: ['QW'], pointers: ['5'], charge: '2500', requiresClia: true },
  { code: '99202', modifiers: ['25', '95'], pointers: ['6', '7'], charge: '16000', requiresClia: false }
];

// CMS-1500 displays six lines per paper page, but Optum's Professional Claims
// API supports up to 50 service lines in one claim. The prototype should model
// the API workflow rather than hide the add action after the first six lines.
const MAX_SERVICE_LINES = 50;

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

// Box 24F / SV102 is already the total charge for the service line. Box 24G
// describes how many units that line represents; multiplying the two would
// overstate CLM02 and make the claim header disagree with its service lines.
function sumServiceLineChargeCents(serviceLines: ServiceLine[]): number {
  return serviceLines.reduce((total, line) => {
    const storedCents = line.professionalService?.lineItemChargeAmount || '0';
    const chargeInCents = Number.parseInt(storedCents.replace(/\D/g, '') || '0', 10);
    return total + (Number.isFinite(chargeInCents) ? chargeInCents : 0);
  }, 0);
}

function localServiceDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// Validate federal tax ID (9 digits)
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

function firstNonBlank(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.trim())?.trim();
}

function normalizeAddressForEnvironment(
  address: Address | undefined,
  isOptumSandbox: boolean
): Address | undefined {
  if (!address) return undefined;

  return {
    ...address,
    // Optum's canned sandbox only accepts lowercase `wa`/`tn`. Production
    // claims continue to use the standard uppercase postal abbreviation.
    state: address.state
      ? (isOptumSandbox ? address.state.toLowerCase() : address.state.toUpperCase())
      : address.state
  };
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

function createDefaultServiceLines(
  serviceDate = '',
  includeExampleCharges = false,
  includeCliaReferences = true
): ServiceLine[] {
  return DEFAULT_SERVICE_LINE_TEMPLATES.map((template) => ({
    serviceDate,
    professionalService: {
      procedureIdentifier: 'HC',
      procedureCode: template.code,
      procedureModifiers: [...template.modifiers],
      lineItemChargeAmount: includeExampleCharges ? template.charge : '',
      measurementUnit: 'UN',
      serviceUnitCount: '1',
      placeOfServiceCode: '10',
      compositeDiagnosisCodePointers: {
        diagnosisCodePointers: [...template.pointers]
      }
    },
    serviceLineReferenceInformation: template.requiresClia && includeCliaReferences
      ? { clinicalLaboratoryImprovementAmendmentNumber: REPERIO_DEFAULT_CLIA_NUMBER }
      : undefined
  }));
}

function createOptumSandboxDefaultData(serviceDate: string): Partial<ClaimSubmissionRequest> {
  const fixture = OPTUM_SANDBOX_FIXTURE;

  return {
    controlNumber: fixture.controlNumber,
    tradingPartnerServiceId: fixture.payerId,
    tradingPartnerName: fixture.payerName,
    submitter: {
      organizationName: fixture.submitter.organizationName,
      contactInformation: {
        name: fixture.submitter.contactName,
        phoneNumber: fixture.submitter.phoneNumber,
        email: fixture.submitter.email
      }
    },
    receiver: {
      organizationName: fixture.payerName
    },
    subscriber: createOptumSandboxSubscriber(),
    billing: {
      providerType: 'BillingProvider',
      organizationName: fixture.billing.organizationName,
      npi: fixture.billing.npi,
      taxIdType: 'EIN',
      employerId: fixture.billing.employerId,
      address: { ...fixture.billing.address },
      contactInformation: {
        name: fixture.billing.contactName,
        phoneNumber: fixture.billing.phoneNumber,
        email: fixture.billing.email
      }
    },
    claimInformation: {
      claimFilingCode: 'CI',
      // Sandbox-only exception: production Box 26 values retain RC- plus 12 digits.
      patientControlNumber: fixture.patientControlNumber,
      claimChargeAmount: '48000',
      placeOfServiceCode: '10',
      claimFrequencyCode: '1',
      signatureIndicator: 'Y',
      planParticipationCode: 'A',
      benefitsAssignmentCertificationIndicator: 'Y',
      releaseInformationCode: 'Y',
      serviceFacilityLocation: {
        organizationName: fixture.serviceFacility.organizationName,
        npi: fixture.serviceFacility.npi,
        address: { ...fixture.serviceFacility.address }
      },
      // Retain Reperio's prototype clinical defaults. Optum's sandbox response
      // is canned, so a successful sandbox call verifies transport/serialization,
      // not payer adjudication or production clinical validation.
      healthCareCodeInformation: [
        ...DEFAULT_DIAGNOSES.map((diagnosis) => ({ ...diagnosis })),
        { diagnosisTypeCode: 'ABF', diagnosisCode: 'E78.5' },
        { diagnosisTypeCode: 'ABF', diagnosisCode: 'R03.0' }
      ],
      // Optum's canned sandbox accepted request intentionally omits CLIA
      // references. Production-like defaults include the X4 reference below.
      serviceLines: createDefaultServiceLines(serviceDate, true, false),
      patientAmountPaid: '0',
      outsideLab: false,
      hasOtherHealthBenefitPlan: false
    }
  };
}

function patientAccountDigits(value?: string): string {
  return (value || '').replace(/\D/g, '').slice(0, 12);
}

function formatPatientAccountNumber(value?: string): string {
  const digits = patientAccountDigits(value);
  return digits ? `RC-${digits}` : '';
}

function generatePatientAccountNumber(): string {
  const timestampDigits = Date.now().toString().slice(-12).padStart(12, '1');
  const digits = timestampDigits.replace(/^0/, '1');
  return `RC-${digits}`;
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
      healthCareCodeInformation: DEFAULT_DIAGNOSES.map((diagnosis) => ({ ...diagnosis })),
      serviceLines: createDefaultServiceLines(),
      patientAmountPaid: '0',
      outsideLab: false,
      hasOtherHealthBenefitPlan: false
    }
  };
}

function isOptumSandboxFixtureData(data: Partial<ClaimSubmissionRequest>): boolean {
  const patientControlNumber = data.claimInformation?.patientControlNumber?.trim() || '';
  return data.tradingPartnerServiceId === OPTUM_SANDBOX_FIXTURE.payerId
    && OPTUM_SANDBOX_PATIENT_CONTROL_NUMBERS.has(patientControlNumber);
}

type PatientRelationship = '18' | Dependent['relationshipToSubscriberCode'];

// Exported so the sandbox identity fixture and production relationship
// transition can be covered without driving the full form.
// eslint-disable-next-line react-refresh/only-export-components
export function applyPatientRelationship(
  previous: Partial<ClaimSubmissionRequest>,
  relationship: PatientRelationship,
  environment: Environment
): Partial<ClaimSubmissionRequest> {
  // SANDBOX-ONLY EXCEPTION: Optum validates identity fields against its
  // published canned John/Jane spouse pair. Preserve the insured John record
  // and populate Jane as the patient instead of copying John into both roles.
  // Production relationship changes retain the editable data.
  if (environment === 'sandbox' && isOptumSandboxFixtureData(previous)) {
    if (relationship === '18') {
      return {
        ...previous,
        subscriber: createOptumSandboxSubscriber(),
        dependent: undefined
      };
    }

    if (relationship === '01') {
      return {
        ...previous,
        // Reperio collects one member ID from the patient. In the canned
        // spouse case Jane is the patient, so John remains the subscriber
        // identity but does not receive Jane's member ID. This intentionally
        // differs from Optum's published two-ID example to exercise Reperio's
        // production one-patient-ID contract.
        subscriber: createOptumSandboxSubscriber(false),
        dependent: createOptumSandboxSpouse()
      };
    }
  }

  if (relationship === '18') {
    const patient = previous.dependent;
    return {
      ...previous,
      subscriber: {
        ...previous.subscriber,
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
        memberId: patient?.memberId || previous.subscriber?.memberId,
        paymentResponsibilityLevelCode: 'P'
      },
      dependent: undefined
    };
  }

  const changingFromSelf = !previous.dependent;
  const currentPatient = previous.dependent || previous.subscriber;

  return {
    ...previous,
    subscriber: {
      ...(changingFromSelf ? {
        policyNumber: previous.subscriber?.policyNumber,
        groupNumber: previous.subscriber?.groupNumber,
        subscriberGroupName: previous.subscriber?.subscriberGroupName
      } : previous.subscriber),
      // The sole collected member ID follows the patient into the dependent
      // object for spouse, child, and other relationship claims.
      memberId: undefined,
      paymentResponsibilityLevelCode: 'P'
    },
    dependent: {
      memberId: currentPatient?.memberId,
      firstName: currentPatient?.firstName || '',
      lastName: currentPatient?.lastName || '',
      middleName: currentPatient?.middleName,
      suffix: currentPatient?.suffix,
      gender: currentPatient?.gender || 'U',
      dateOfBirth: currentPatient?.dateOfBirth || '',
      relationshipToSubscriberCode: relationship,
      address: currentPatient?.address || {
        address1: '',
        city: '',
        state: '',
        postalCode: ''
      },
      contactInformation: currentPatient?.contactInformation
    }
  };
}

// Exported to cover local-draft migrations for the exclusive patient member ID.
// eslint-disable-next-line react-refresh/only-export-components
export function normalizeSavedFormData(savedData: Partial<ClaimSubmissionRequest>): Partial<ClaimSubmissionRequest> {
  const initial = createInitialFormData();
  const savedClaimInformation = savedData.claimInformation;
  const savedSubscriber = savedData.subscriber;
  const selfDependent = savedData.dependent?.relationshipToSubscriberCode === ('18' as string)
    ? savedData.dependent
    : undefined;
  const savedDependent = selfDependent ? undefined : savedData.dependent;
  const isSavedOptumSandboxFixture = isOptumSandboxFixtureData(savedData);
  const isSavedSandboxSpouse = isSavedOptumSandboxFixture
    && savedDependent?.relationshipToSubscriberCode === '01';
  // Reconcile older drafts into the one-ID invariant without losing the value:
  // the collected ID belongs to whichever object represents the patient. An
  // old canned spouse draft receives Jane's published sandbox ID rather than
  // incorrectly migrating John's prior subscriber ID onto Jane.
  const patientMemberId = isSavedSandboxSpouse
    ? OPTUM_SANDBOX_FIXTURE.spouse.memberId
    : savedDependent
      ? firstNonBlank(savedDependent.memberId, savedSubscriber?.memberId)
      : firstNonBlank(savedSubscriber?.memberId, selfDependent?.memberId);
  const dependent = savedDependent ? {
    ...savedDependent,
    memberId: patientMemberId
  } : undefined;
  const savedPatientControlNumber = savedClaimInformation?.patientControlNumber?.trim() || '';

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
      memberId: dependent ? undefined : patientMemberId,
      paymentResponsibilityLevelCode: 'P'
    },
    dependent,
    billing: {
      ...savedData.billing,
      // Preserve Optum's pseudo-provider only for a recognized sandbox fixture.
      // Every other saved draft follows the production Box 32/33 Reperio rules.
      organizationName: isSavedOptumSandboxFixture
        ? savedData.billing?.organizationName
        : (savedClaimInformation?.serviceFacilityLocation?.organizationName || savedData.billing?.organizationName),
      npi: isSavedOptumSandboxFixture
        ? savedData.billing?.npi
        : (savedClaimInformation?.serviceFacilityLocation?.npi || savedData.billing?.npi),
      address: isSavedOptumSandboxFixture
        ? savedData.billing?.address
        : { ...REPERIO_BILLING_ADDRESS },
      contactInformation: isSavedOptumSandboxFixture
        ? savedData.billing?.contactInformation
        : {
            ...savedData.billing?.contactInformation,
            name: REPERIO_BILLING_CONTACT_NAME,
            phoneNumber: REPERIO_BILLING_PHONE,
            email: REPERIO_BILLING_EMAIL
          },
      taxonomyCode: undefined,
      taxIdType: 'EIN',
      ssn: undefined,
      providerType: 'BillingProvider'
    },
    rendering: savedData.rendering ? {
      ...savedData.rendering,
      providerType: 'RenderingProvider'
    } : undefined,
    referring: undefined,
    claimInformation: {
      ...initial.claimInformation,
      ...savedClaimInformation,
      claimFilingCode: 'CI',
      patientControlNumber: isSavedOptumSandboxFixture
        ? savedPatientControlNumber
        : formatPatientAccountNumber(savedClaimInformation?.patientControlNumber),
      placeOfServiceCode: '10',
      claimFrequencyCode: '1',
      planParticipationCode: 'A',
      signatureIndicator: 'Y',
      benefitsAssignmentCertificationIndicator: savedClaimInformation?.benefitsAssignmentCertificationIndicator || 'Y',
      releaseInformationCode: savedClaimInformation?.releaseInformationCode || 'Y',
      propertyCasualtyClaimNumber: undefined,
      relatedCausesCode: undefined,
      autoAccidentStateCode: undefined,
      claimDateInformation: undefined,
      claimNote: undefined,
      claimSupplementalInformation: undefined,
      patientAmountPaid: '0',
      outsideLab: false,
      hasOtherHealthBenefitPlan: false,
      serviceFacilityLocation: savedClaimInformation?.serviceFacilityLocation ? {
        ...savedClaimInformation.serviceFacilityLocation,
        phoneName: undefined,
        phoneNumber: undefined
      } : undefined,
      healthCareCodeInformation: DEFAULT_DIAGNOSES.map((diagnosis, index) => ({
        ...diagnosis,
        diagnosisCode: savedClaimInformation?.healthCareCodeInformation?.[index]?.diagnosisCode ?? diagnosis.diagnosisCode
      })).concat((savedClaimInformation?.healthCareCodeInformation || []).slice(DEFAULT_DIAGNOSES.length)),
      serviceLines: savedClaimInformation?.serviceLines?.length
        ? savedClaimInformation.serviceLines.map((line) => ({
            ...line,
            serviceDateEnd: undefined,
            professionalService: {
              ...line.professionalService,
              placeOfServiceCode: '10',
              emergencyIndicator: undefined
            }
          }))
        : createDefaultServiceLines()
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

const REQUIRED_LABEL_CLASS = 'text-[#c41e3a]';
const OPTIONAL_LABEL_CLASS = 'text-gray-900';
const NOT_APPLICABLE_LABEL_CLASS = 'text-gray-400';
const REQUIRED_FIELD_CLASS = 'border-[#c41e3a] text-[#c41e3a]';
const OPTIONAL_FIELD_CLASS = 'border-gray-800 text-gray-900';
const NOT_APPLICABLE_FIELD_CLASS = 'border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed';

interface BuildClaimOptions {
  environment: Environment;
  submitAsTest: boolean;
  patientSignatureOnFile: boolean;
  authorizedSignatureOnFile: boolean;
  physicianSignatureDate: string;
}

// Exported so payload invariants can be tested without driving the full form.
// eslint-disable-next-line react-refresh/only-export-components
export function buildPrimaryClaimRequest(
  formData: Partial<ClaimSubmissionRequest>,
  options: BuildClaimOptions
): ClaimSubmissionRequest {
  const errors: string[] = [];
  const isOptumSandbox = options.environment === 'sandbox';
  const requireValue = (value: unknown, label: string) => {
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push(label);
    }
  };

  const payerId = formData.tradingPartnerServiceId?.trim() || '';
  const payerName = formData.tradingPartnerName?.trim()
    || formData.receiver?.organizationName?.trim()
    || '';
  requireValue(payerId, 'Payer ID');
  requireValue(payerName, 'Payer name');

  const requireDigits = (value: string | undefined, length: number, label: string) => {
    if (value && !new RegExp(`^\\d{${length}}$`).test(value.replace(/\D/g, ''))) {
      errors.push(`${label} (${length} digits)`);
    }
  };

  const subscriberSource = formData.subscriber;
  const dependentSource = formData.dependent;
  // Reperio collects one member ID from the patient. Prefer the relationship-
  // appropriate root, while accepting the old root as a migration fallback.
  const patientMemberId = dependentSource
    ? (firstNonBlank(dependentSource.memberId, subscriberSource?.memberId) || '')
    : (firstNonBlank(subscriberSource?.memberId) || '');
  const subscriberName = [subscriberSource?.firstName, subscriberSource?.lastName].filter(Boolean).join(' ').trim();
  requireValue(patientMemberId, 'Box 1a - Patient member ID');
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
    subscriberGroupName: undefined,
    // A dependent claim carries the sole patient ID in Loop 2010CA instead.
    memberId: dependentSource ? undefined : patientMemberId,
    firstName: subscriberSource?.firstName?.trim(),
    lastName: subscriberSource?.lastName?.trim(),
    dateOfBirth: formatDateForAPI(subscriberSource?.dateOfBirth || ''),
    address: normalizeAddressForEnvironment(subscriberSource?.address, isOptumSandbox),
    contactInformation: subscriberSource?.contactInformation ? {
      ...subscriberSource.contactInformation,
      name: subscriberSource.contactInformation.name?.trim() || subscriberName || 'Subscriber'
    } : undefined
  };

  let dependent: Dependent | undefined;
  if (dependentSource) {
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
      memberId: patientMemberId,
      firstName: dependentSource.firstName?.trim() || '',
      lastName: dependentSource.lastName?.trim() || '',
      dateOfBirth: formatDateForAPI(dependentSource.dateOfBirth),
      address: normalizeAddressForEnvironment(dependentSource.address, isOptumSandbox),
      contactInformation: dependentSource.contactInformation ? {
        ...dependentSource.contactInformation,
        name: dependentSource.contactInformation.name?.trim() || dependentName || 'Patient'
      } : undefined
    };
  }

  const facilitySource = formData.claimInformation?.serviceFacilityLocation;
  requireValue(facilitySource?.organizationName, 'Box 32 - Service facility name');
  requireValue(facilitySource?.address?.address1, 'Box 32 - Service facility street address');
  requireValue(facilitySource?.address?.city, 'Box 32 - Service facility city');
  requireValue(facilitySource?.address?.state, 'Box 32 - Service facility state');
  requireValue(facilitySource?.address?.postalCode, 'Box 32 - Service facility ZIP code');
  requireValue(facilitySource?.npi, 'Box 32a - Service facility NPI');
  requireDigits(facilitySource?.npi, 10, 'Box 32a - Service facility NPI');
  const serviceFacilityLocation: ServiceFacilityLocation = {
    ...facilitySource,
    organizationName: facilitySource?.organizationName?.trim() || '',
    address: normalizeAddressForEnvironment(facilitySource?.address, isOptumSandbox)
      || { address1: '', city: '' },
    npi: facilitySource?.npi?.replace(/\D/g, ''),
    phoneName: undefined,
    phoneNumber: undefined
  };

  const billingSource = formData.billing;
  // Production Box 33 mirrors Box 32's organization/NPI and uses Reperio's
  // fixed billing address. Optum's sandbox is the sole exception: its canned
  // Billing Provider and Service Facility are deliberately different entities.
  const billingName = isOptumSandbox
    ? billingSource?.organizationName?.trim()
    : serviceFacilityLocation.organizationName;
  const billingNpi = isOptumSandbox
    ? billingSource?.npi?.replace(/\D/g, '')
    : serviceFacilityLocation.npi;
  const billingTaxId = billingSource?.employerId;
  requireValue(billingName, 'Box 33 - Billing provider organization name');
  requireValue(billingNpi, 'Box 33a - Billing provider NPI');
  requireDigits(billingNpi, 10, 'Box 33a - Billing provider NPI');
  requireValue(billingTaxId, 'Box 25 - Federal tax ID');
  requireDigits(billingTaxId, 9, 'Box 25 - Federal tax ID');

  if (isOptumSandbox) {
    requireValue(billingSource?.address?.address1, 'Sandbox billing provider street address');
    requireValue(billingSource?.address?.city, 'Sandbox billing provider city');
    requireValue(billingSource?.address?.state, 'Sandbox billing provider state');
    requireValue(billingSource?.address?.postalCode, 'Sandbox billing provider ZIP code');
    requireValue(billingSource?.contactInformation?.name, 'Sandbox billing contact name');
    requireValue(billingSource?.contactInformation?.phoneNumber, 'Sandbox billing contact phone');
  }

  // taxIdType selects which OpenAPI field to populate, but is not itself part
  // of the Optum billing schema and must not leak into the request body.
  const billingApiFields: Partial<Provider> = { ...billingSource };
  delete billingApiFields.taxIdType;

  const billing: Provider = {
    ...billingApiFields,
    providerType: 'BillingProvider',
    organizationName: billingName,
    firstName: undefined,
    lastName: undefined,
    middleName: undefined,
    suffix: undefined,
    npi: billingNpi,
    employerId: billingTaxId?.replace(/\D/g, ''),
    ssn: undefined,
    taxonomyCode: undefined,
    address: isOptumSandbox
      ? normalizeAddressForEnvironment(billingSource?.address, true)
      : { ...REPERIO_BILLING_ADDRESS },
    contactInformation: isOptumSandbox
      ? {
          ...billingSource?.contactInformation,
          name: billingSource?.contactInformation?.name?.trim() || '',
          phoneNumber: billingSource?.contactInformation?.phoneNumber,
          email: billingSource?.contactInformation?.email
        }
      : {
          ...billingSource?.contactInformation,
          name: REPERIO_BILLING_CONTACT_NAME,
          phoneNumber: REPERIO_BILLING_PHONE,
          email: REPERIO_BILLING_EMAIL
        }
  };

  const diagnosisSource = formData.claimInformation?.healthCareCodeInformation || [];
  DEFAULT_DIAGNOSES.forEach((_, index) => {
    requireValue(diagnosisSource[index]?.diagnosisCode, `Box 21${String.fromCharCode(65 + index)} - Diagnosis code`);
  });
  const lastDiagnosisIndex = diagnosisSource.reduce(
    (lastIndex, diagnosis, index) => diagnosis.diagnosisCode?.trim() ? index : lastIndex,
    -1
  );
  for (let index = 0; index <= lastDiagnosisIndex; index += 1) {
    if (!diagnosisSource[index]?.diagnosisCode?.trim()) {
      errors.push(`Box 21${String.fromCharCode(65 + index)} - Diagnosis codes cannot contain gaps`);
    }
  }
  const diagnoses = diagnosisSource
    .slice(0, lastDiagnosisIndex + 1)
    .filter((diagnosis) => diagnosis.diagnosisCode?.trim())
    .map((diagnosis, index) => ({
      diagnosisTypeCode: index === 0 ? 'ABK' : 'ABF',
      diagnosisCode: normalizeDiagnosisCode(diagnosis.diagnosisCode)
    }));
  if (diagnoses.length === 0) errors.push('Box 21 - At least one diagnosis code');

  const serviceLines = (formData.claimInformation?.serviceLines || []).map((line, index) => {
    const lineNumber = index + 1;
    requireValue(line.serviceDate, `Box 24A - Service line ${lineNumber} date`);
    // Box 24B is an invariant in this limited telehealth workflow. The request
    // below always emits place-of-service 10 rather than accepting draft data.
    requireValue(line.professionalService?.procedureCode, `Box 24D - Service line ${lineNumber} procedure code`);
    requireValue(line.professionalService?.lineItemChargeAmount, `Box 24F - Service line ${lineNumber} charge`);
    requireValue(line.professionalService?.serviceUnitCount, `Box 24G - Service line ${lineNumber} units`);

    const pointers = (line.professionalService?.compositeDiagnosisCodePointers?.diagnosisCodePointers || [])
      .filter(Boolean)
      .slice(0, 4)
      .map(diagnosisPointerForApi);
    const procedureModifiers = (line.professionalService?.procedureModifiers || [])
      .filter(Boolean)
      .slice(0, 4);
    const requiresClia = procedureModifiers.includes('QW');
    const cliaNumber = line.serviceLineReferenceInformation
      ?.clinicalLaboratoryImprovementAmendmentNumber
      ?.trim();
    if (pointers.length === 0) errors.push(`Box 24E - Service line ${lineNumber} diagnosis pointer`);
    if (pointers.some((pointer) => !/^\d{1,2}$/.test(pointer) || Number(pointer) < 1 || Number(pointer) > diagnoses.length)) {
      errors.push(`Box 24E - Service line ${lineNumber} diagnosis pointer must reference Box 21`);
    }
    if (!isOptumSandbox && requiresClia) {
      requireValue(cliaNumber, `Box 24 - Service line ${lineNumber} CLIA number`);
    }

    let renderingProvider: Provider | undefined;
    if (!isOptumSandbox) {
      requireValue(line.renderingProvider?.npi, `Box 24J - Service line ${lineNumber} rendering NPI`);
      requireValue(line.renderingProvider?.firstName, `Box 24J - Service line ${lineNumber} rendering provider first name`);
      requireValue(line.renderingProvider?.lastName, `Box 24J - Service line ${lineNumber} rendering provider last name`);
    }
    if (hasProviderIdentity(line.renderingProvider)) {
      const renderingSource = line.renderingProvider!;
      if (isOptumSandbox) {
        requireValue(renderingSource.npi, `Box 24J - Service line ${lineNumber} rendering NPI`);
      }
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
      serviceDateEnd: undefined,
      professionalService: {
        ...line.professionalService,
        procedureIdentifier: line.professionalService?.procedureIdentifier || 'HC',
        procedureCode: line.professionalService?.procedureCode?.trim().toUpperCase() || '',
        procedureModifiers: procedureModifiers.length > 0 ? procedureModifiers : undefined,
        lineItemChargeAmount: formatCurrency(line.professionalService?.lineItemChargeAmount || ''),
        measurementUnit: line.professionalService?.measurementUnit || 'UN',
        serviceUnitCount: line.professionalService?.serviceUnitCount || '',
        placeOfServiceCode: '10',
        emergencyIndicator: undefined,
        compositeDiagnosisCodePointers: {
          diagnosisCodePointers: pointers
        }
      },
      // Optum's canned sandbox fixture succeeds without an X4 reference and
      // rejects many non-predefined values. Real QW lines retain the CLIA
      // reference required by this workflow.
      serviceLineReferenceInformation: !isOptumSandbox && cliaNumber
        ? { clinicalLaboratoryImprovementAmendmentNumber: cliaNumber }
        : undefined,
      renderingProvider
    } as ServiceLine;
  });
  if (serviceLines.length === 0) errors.push('Box 24 - At least one service line');

  const rawPatientControlNumber = formData.claimInformation?.patientControlNumber?.trim() || '';
  // Optum's sandbox only accepts a short list of canned identifiers. Do not
  // weaken the production RC-XXXXXXXXXXXX validation to accommodate them.
  const patientControlNumber = isOptumSandbox
    ? rawPatientControlNumber
    : formatPatientAccountNumber(rawPatientControlNumber);
  if (isOptumSandbox && !OPTUM_SANDBOX_PATIENT_CONTROL_NUMBERS.has(patientControlNumber)) {
    errors.push('Box 26 - Optum sandbox requires a predefined patient control number; reload sandbox test data');
  } else if (!isOptumSandbox && !/^RC-[1-9]\d{11}$/.test(patientControlNumber)) {
    errors.push("Box 26 - Patient account number must contain 12 digits and cannot start with zero");
  }
  requireValue(options.physicianSignatureDate, 'Box 31 - Physician signature date');

  const submitterSource = formData.submitter;
  if (isOptumSandbox) {
    requireValue(submitterSource?.organizationName, 'Sandbox submitter organization name');
    requireValue(submitterSource?.contactInformation?.name, 'Sandbox submitter contact name');
    requireValue(submitterSource?.contactInformation?.phoneNumber, 'Sandbox submitter contact phone');
  }
  const submitter: ClaimSubmissionRequest['submitter'] = isOptumSandbox
    ? {
        ...submitterSource,
        organizationName: submitterSource?.organizationName?.trim(),
        contactInformation: {
          ...submitterSource?.contactInformation,
          name: submitterSource?.contactInformation?.name?.trim() || '',
          phoneNumber: submitterSource?.contactInformation?.phoneNumber,
          email: submitterSource?.contactInformation?.email
        }
      }
    : {
        ...submitterSource,
        organizationName: billing.organizationName?.trim()
          || submitterSource?.organizationName?.trim(),
        firstName: billing.organizationName ? undefined : (billing.firstName?.trim() || submitterSource?.firstName?.trim()),
        lastName: billing.organizationName ? undefined : (billing.lastName?.trim() || submitterSource?.lastName?.trim()),
        middleName: billing.organizationName ? undefined : (billing.middleName?.trim() || submitterSource?.middleName?.trim()),
        contactInformation: {
          ...submitterSource?.contactInformation,
          ...billing.contactInformation,
          name: billing.contactInformation?.name?.trim()
            || submitterSource?.contactInformation?.name?.trim()
            || billingName
            || '',
          phoneNumber: billing.contactInformation?.phoneNumber
            || submitterSource?.contactInformation?.phoneNumber
            || '',
          email: billing.contactInformation?.email
            || submitterSource?.contactInformation?.email
        }
      };

  const rendering = hasProviderIdentity(formData.rendering) ? {
    ...formData.rendering,
    providerType: 'RenderingProvider' as const,
    npi: formData.rendering?.npi?.replace(/\D/g, '')
  } : undefined;
  if (errors.length > 0) {
    throw new Error(`Please complete the required claim fields:\n- ${errors.join('\n- ')}`);
  }

  const totalChargeCents = sumServiceLineChargeCents(formData.claimInformation?.serviceLines || []);

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
    claimInformation: {
      claimFilingCode: 'CI',
      patientControlNumber,
      placeOfServiceCode: '10',
      claimChargeAmount: formatCurrency(String(totalChargeCents)),
      planParticipationCode: 'A',
      claimFrequencyCode: '1',
      signatureIndicator: 'Y',
      benefitsAssignmentCertificationIndicator: options.authorizedSignatureOnFile ? 'Y' : 'N',
      releaseInformationCode: options.patientSignatureOnFile ? 'Y' : 'I',
      patientAmountPaid: '0.00',
      serviceFacilityLocation,
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
  const [physicianSignatureDate, setPhysicianSignatureDate] = useState(() => (
    localStorage.getItem(STORAGE_KEY_PHYSICIAN_SIGNATURE_DATE) || ''
  ));
  // A clearinghouse tracking number belongs to one submitted payload. Do not
  // restore it independently from localStorage where it could be displayed on
  // a different edited draft.
  const [optumTrackingNumber, setOptumTrackingNumber] = useState('');

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ClaimResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<ClaimSubmissionRequest | null>(null);
  const [actionType, setActionType] = useState<'validate' | 'submit' | null>(null);

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

  // Save editable signature states to localStorage. Box 31 is always marked
  // "signature on file" for this workflow, so only its date is editable.
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_FORM_DATA}-patientSignature`, patientSignatureOnFile.toString());
    localStorage.setItem(`${STORAGE_KEY_FORM_DATA}-authorizedSignature`, authorizedSignatureOnFile.toString());
  }, [patientSignatureOnFile, authorizedSignatureOnFile]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PHYSICIAN_SIGNATURE_DATE, physicianSignatureDate);
  }, [physicianSignatureDate]);

  // Save provider option to localStorage
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_FORM_DATA}-providerOption`, selectedProviderOption);
  }, [selectedProviderOption]);

  // Handle provider dropdown change
  const handleProviderPresetChange = (value: string) => {
    setSelectedProviderOption(value);
    
    if (value === CUSTOM_PROVIDER_OPTION) {
      // Preserve the current values so a preset can be used as the starting
      // point for a custom facility rather than silently discarding it.
      return;
    }

    const selectedOption = PROVIDER_OPTIONS.find((option) => option.npi === value);
    if (selectedOption) {
      // Populate both Box 32 (Service Facility) and Box 33 (Billing Provider)
      setFormData((prev) => {
        const newData = { ...prev };
        
        // Box 33 uses the Box 32 organization/NPI, the fixed Reperio billing
        // address, and the fixed claims-support phone number.
        newData.billing = {
          ...newData.billing,
          providerType: 'BillingProvider',
          organizationName: selectedOption.organizationName,
          npi: selectedOption.npi,
          employerId: selectedOption.ein || newData.billing?.employerId,
          taxIdType: 'EIN',
          ssn: undefined,
          address: { ...REPERIO_BILLING_ADDRESS },
          contactInformation: {
            ...newData.billing?.contactInformation,
            name: REPERIO_BILLING_CONTACT_NAME,
            phoneNumber: REPERIO_BILLING_PHONE,
            email: REPERIO_BILLING_EMAIL
          },
          taxonomyCode: undefined
        };
        
        // Box 32 (Service Facility Location) - use organizationName for submission
        newData.claimInformation = {
          ...newData.claimInformation,
          serviceFacilityLocation: {
            organizationName: selectedOption.organizationName,
            npi: selectedOption.npi,
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

  // A response and clearinghouse tracking number describe one immutable
  // request. Draft edits invalidate a completed result. While a request is in
  // flight, the root fieldset is disabled: an already-sent POST cannot be
  // cancelled safely, and allowing edits/re-submission could hide an accepted
  // claim or create a duplicate.
  useEffect(() => {
    setResponse(null);
    setError(null);
    setLastRequest(null);
    setActionType(null);
    setOptumTrackingNumber('');
  }, [
    formData,
    environment,
    submitAsTest,
    patientSignatureOnFile,
    authorizedSignatureOnFile,
    physicianSignatureDate
  ]);

  // Never carry Optum's canned pseudo-patient/provider fixture into the
  // production endpoint. Other manually entered drafts remain intact when the
  // user changes environments.
  useEffect(() => {
    if (environment !== 'sandbox') {
      setFormData((previous) => (
        isOptumSandboxFixtureData(previous) ? createInitialFormData() : previous
      ));
    }
  }, [environment]);

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

  const updateServiceLines = (updater: (current: ServiceLine[]) => ServiceLine[]) => {
    setFormData((previous) => {
      const current = previous.claimInformation?.serviceLines || [];
      const next = updater(current);
      if (next === current) return previous;

      return {
        ...previous,
        claimInformation: {
          ...previous.claimInformation,
          serviceLines: next
        } as ClaimSubmissionRequest['claimInformation']
      };
    });
  };

  const updateServiceLineAt = (index: number, updater: (line: ServiceLine) => ServiceLine) => {
    updateServiceLines((current) => {
      if (!current[index]) return current;
      const next = [...current];
      next[index] = updater(current[index]);
      return next;
    });
  };

  const setPatientRelationship = (relationship: PatientRelationship) => {
    setFormData((previous) => applyPatientRelationship(previous, relationship, environment));
  };

  const addServiceLine = () => {
    updateServiceLines((currentLines) => {
      if (currentLines.length >= MAX_SERVICE_LINES) return currentLines;

      const newLine = createEmptyServiceLine();
      // Box 24A is shared by every service in this limited workflow. Preserve
      // the claim's existing service date and leave only non-default values—such
      // as procedure, diagnosis pointer, charge, and rendering provider—blank.
      newLine.serviceDate = currentLines[0]?.serviceDate || '';
      return [...currentLines, newLine];
    });
  };

  const updateAllServiceDates = (serviceDate: string) => {
    updateServiceLines((current) => current.map((line) => ({
      ...line,
      serviceDate,
      serviceDateEnd: undefined
    })));
  };

  const updateServiceLine = (index: number, field: string, value: string) => {
    updateServiceLineAt(index, (line) => {
      if (field.includes('.')) {
        const [mainField, subField] = field.split('.');
        return {
          ...line,
          [mainField]: {
            ...(line as unknown as Record<string, Record<string, unknown>>)[mainField],
            [subField]: value
          }
        } as ServiceLine;
      }

      return { ...line, [field]: value } as ServiceLine;
    });
  };

  const updateServiceLineProcedure = (index: number, procedureCode: string) => {
    const procedure = PROCEDURE_OPTIONS.find((option) => option.code === procedureCode);
    const requiresClia = procedure?.modifiers.includes('QW') || false;
    updateServiceLineAt(index, (line) => ({
      ...line,
      professionalService: {
        ...line.professionalService,
        procedureCode,
        procedureModifiers: procedure ? [...procedure.modifiers] : line.professionalService.procedureModifiers
      },
      serviceLineReferenceInformation: requiresClia && environment !== 'sandbox'
        ? {
            clinicalLaboratoryImprovementAmendmentNumber:
              line.serviceLineReferenceInformation?.clinicalLaboratoryImprovementAmendmentNumber
              || REPERIO_DEFAULT_CLIA_NUMBER
          }
        : undefined
    }));
  };

  const updateDiagnosis = (index: number, value: string) => {
    setFormData((previous) => {
      const diagnoses = [...(previous.claimInformation?.healthCareCodeInformation || [])];
      diagnoses[index] = {
        ...diagnoses[index],
        diagnosisTypeCode: index === 0 ? 'ABK' : 'ABF',
        diagnosisCode: value
      };
      return {
        ...previous,
        claimInformation: {
          ...previous.claimInformation,
          healthCareCodeInformation: diagnoses
        } as ClaimSubmissionRequest['claimInformation']
      };
    });
  };

  const handleValidate = async () => {
    let claimRequest: ClaimSubmissionRequest | null = null;
    setLoading(true);
    setError(null);
    setResponse(null);
    setActionType('validate');

    try {
      claimRequest = buildPrimaryClaimRequest(formData, {
        environment,
        submitAsTest,
        patientSignatureOnFile,
        authorizedSignatureOnFile,
        physicianSignatureDate
      });
      setLastRequest(claimRequest);
      const result = await validateClaim(claimRequest, environment);
      // Re-publish the captured request after the await so the response panel
      // always receives the exact immutable request/response pair.
      setLastRequest(claimRequest);
      setActionType('validate');
      setResponse(result);
    } catch (err) {
      if (claimRequest) setLastRequest(claimRequest);
      setActionType('validate');
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    let claimRequest: ClaimSubmissionRequest | null = null;
    setLoading(true);
    setError(null);
    setResponse(null);
    setOptumTrackingNumber('');
    setActionType('submit');

    try {
      claimRequest = buildPrimaryClaimRequest(formData, {
        environment,
        submitAsTest,
        patientSignatureOnFile,
        authorizedSignatureOnFile,
        physicianSignatureDate
      });
      setLastRequest(claimRequest);
      const result = await submitClaim(claimRequest, environment);
      setLastRequest(claimRequest);
      setActionType('submit');
      setResponse(result);
      setOptumTrackingNumber(
        result.claimReference?.rhclaimNumber
        || result.claimReference?.rhClaimNumber
        || ''
      );
    } catch (err) {
      if (claimRequest) setLastRequest(claimRequest);
      setActionType('submit');
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
    updateServiceLines((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const clearForm = () => {
    setFormData(createInitialFormData());
    setPatientSignatureOnFile(true);
    setAuthorizedSignatureOnFile(true);
    setPhysicianSignatureDate('');
    setOptumTrackingNumber('');
    setSelectedProviderOption(CUSTOM_PROVIDER_OPTION);
    setResponse(null);
    setError(null);
  };

  const loadDefaultData = () => {
    const defaultProvider = PROVIDER_OPTIONS[0];
    const defaultPayerId = '87726';
    const defaultPayerName = 'UnitedHealthcare';
    const serviceDate = localServiceDate();
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

    // The sandbox fixture is intentionally selected by environment instead of
    // being mixed into the production defaults. Optum rejects real/invented
    // identities in sandbox, while production must never receive pseudo-data.
    const testData: Partial<ClaimSubmissionRequest> = environment === 'sandbox'
      ? createOptumSandboxDefaultData(serviceDate)
      : {
      controlNumber: generateControlNumber(),
      tradingPartnerServiceId: defaultPayerId,
      tradingPartnerName: defaultPayerName,
      submitter: {
        organizationName: defaultProvider?.organizationName || 'Reperio Health Medical Group, PLLC',
        contactInformation: {
          name: REPERIO_BILLING_CONTACT_NAME,
          phoneNumber: REPERIO_BILLING_PHONE,
          email: REPERIO_BILLING_EMAIL
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
        address: { ...REPERIO_BILLING_ADDRESS },
        contactInformation: {
          name: REPERIO_BILLING_CONTACT_NAME,
          phoneNumber: REPERIO_BILLING_PHONE,
          email: REPERIO_BILLING_EMAIL
        }
      },
      claimInformation: {
        claimFilingCode: 'CI',
        patientControlNumber: generatePatientAccountNumber(),
        claimChargeAmount: '48000',
        placeOfServiceCode: '10',
        claimFrequencyCode: '1',
        signatureIndicator: 'Y',
        planParticipationCode: 'A',
        benefitsAssignmentCertificationIndicator: 'Y',
        releaseInformationCode: 'Y',
        serviceFacilityLocation: {
          organizationName: defaultProvider?.organizationName || 'Reperio Health Medical Group, PLLC',
          npi: defaultProvider?.npi || '1982438362',
          address: { ...providerAddress }
        },
        healthCareCodeInformation: [
          ...DEFAULT_DIAGNOSES.map((diagnosis) => ({ ...diagnosis })),
          { diagnosisTypeCode: 'ABF', diagnosisCode: 'E78.5' },
          { diagnosisTypeCode: 'ABF', diagnosisCode: 'R03.0' }
        ],
        serviceLines: createDefaultServiceLines(serviceDate, true),
        patientAmountPaid: '0',
        outsideLab: false,
        hasOtherHealthBenefitPlan: false
      }
    };
    
    setFormData(testData);
    setSelectedProviderOption(
      environment === 'sandbox'
        ? CUSTOM_PROVIDER_OPTION
        : (defaultProvider?.npi || CUSTOM_PROVIDER_OPTION)
    );
    setSubmitAsTest(true);
    setPatientSignatureOnFile(true);
    setAuthorizedSignatureOnFile(true);
    setPhysicianSignatureDate('');
    setOptumTrackingNumber('');
    setResponse(null);
    setError(null);
    setLastRequest(null);
    setActionType(null);
  };

  const patient = patientIsSubscriber ? formData.subscriber : formData.dependent;
  const patientFieldRoot = patientIsSubscriber ? 'subscriber' : 'dependent';
  const requiredDiagnosisIndexes = new Set<number>([0, 1, 2, 3, 4]);
  effectiveServiceLines.forEach((line) => {
    line.professionalService?.compositeDiagnosisCodePointers?.diagnosisCodePointers.forEach((pointer) => {
      const index = Number(diagnosisPointerForApi(pointer)) - 1;
      if (index >= 0 && index < 12) requiredDiagnosisIndexes.add(index);
    });
  });
  const isOptumSandbox = environment === 'sandbox';
  const billingAddressForDisplay = isOptumSandbox
    ? (formData.billing?.address || OPTUM_SANDBOX_FIXTURE.billing.address)
    : REPERIO_BILLING_ADDRESS;
  const billingContactForDisplay = isOptumSandbox
    ? formData.billing?.contactInformation
    : {
        name: REPERIO_BILLING_CONTACT_NAME,
        phoneNumber: REPERIO_BILLING_PHONE,
        email: REPERIO_BILLING_EMAIL
      };
  const billingOrganizationForDisplay = isOptumSandbox
    ? (formData.billing?.organizationName || '')
    : (formData.claimInformation?.serviceFacilityLocation?.organizationName || '');
  const billingNpiForDisplay = isOptumSandbox
    ? (formData.billing?.npi || '')
    : (formData.claimInformation?.serviceFacilityLocation?.npi || '');

  return (
    <fieldset disabled={loading} className="w-full min-w-0 border-0 p-0 m-0">
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
                  className={`w-4 h-4 ${OPTIONAL_FIELD_CLASS}`}
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
                  {isOptumSandbox ? 'Load Optum Sandbox Data' : 'Load Default Data'}
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
            {isOptumSandbox && (
              <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <span className="font-semibold">Optum sandbox exception:</span>{' '}
                use “Load Optum Sandbox Data” before validating. Optum requires published pseudo-patient,
                pseudo-provider, payer, and Box 26 values in this environment. These are transport-test values
                only and must never be used for a production claim.
              </div>
            )}
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

          <div className="pb-4 border-b-2 border-gray-300">
            <label htmlFor="optum-clearinghouse-tracking-number" className={`text-sm font-bold mb-2 block ${OPTIONAL_LABEL_CLASS}`}>
              Optum Clearing House Tracking Number
            </label>
            <input
              id="optum-clearinghouse-tracking-number"
              type="text"
              value={optumTrackingNumber}
              readOnly
              disabled
              placeholder="Assigned by Optum after claim submission"
              className={`w-full p-2 border rounded bg-gray-100 cursor-not-allowed ${OPTIONAL_FIELD_CLASS}`}
            />
            <p className="mt-1 text-xs text-gray-600">
              Clearinghouse tracking only; this is not the payer-assigned claim number.
            </p>
          </div>

          {/* Payer Information */}
          <div className="pb-4 border-b-2 border-gray-300">
            <label className="text-sm font-bold text-gray-700 mb-2 block">Payer Information</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="claim-health-plan-name" className={`text-xs font-semibold mb-1 block ${REQUIRED_LABEL_CLASS}`}>
                  Health plan name <span className="font-normal">(health_plan_name)</span>
                </label>
                <input
                  id="claim-health-plan-name"
                  type="text"
                  value={formData.tradingPartnerName || ''}
                  onChange={(e) => {
                    const healthPlanName = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      tradingPartnerName: healthPlanName,
                      receiver: {
                        ...prev.receiver,
                        organizationName: healthPlanName
                      }
                    }));
                  }}
                  placeholder="Insurance company or health plan"
                  className={`w-full p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
                />
              </div>
              <div>
                <label htmlFor="claim-payer-id" className={`text-xs font-semibold mb-1 block ${REQUIRED_LABEL_CLASS}`}>
                  Payer ID <span className="font-normal">(payer_id)</span>
                </label>
                <input
                  id="claim-payer-id"
                  type="text"
                  value={formData.tradingPartnerServiceId || ''}
                  onChange={(e) => updateField(['tradingPartnerServiceId'], e.target.value)}
                  placeholder="Optum trading partner service ID"
                  className={`w-full p-2 border rounded font-mono ${REQUIRED_FIELD_CLASS}`}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-600">
              Submitted as <code>tradingPartnerName</code>, <code>receiver.organizationName</code>, and <code>tradingPartnerServiceId</code>. Payer responsibility: <span className="font-semibold">Primary (P)</span>.
            </p>
          </div>

          {/* Provider Selection (populates Box 32 and Box 33 identity) */}
          <div className="pb-4 border-b-2 border-gray-300">
            <label className="text-sm font-bold text-gray-700 mb-2 block">
              Provider (Billing & Service Facility)
            </label>
            <select
              value={selectedProviderOption}
              onChange={(e) => handleProviderPresetChange(e.target.value)}
              className={`w-full p-2 border rounded mb-2 ${OPTIONAL_FIELD_CLASS}`}
            >
              <option value={CUSTOM_PROVIDER_OPTION}>-- Enter Custom Provider --</option>
              {PROVIDER_OPTIONS.map((provider) => (
                <option key={provider.npi} value={provider.npi}>
                  {provider.name} (NPI: {provider.npi})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {isOptumSandbox
                ? 'Sandbox testing uses Optum’s separate canned Billing Provider and Service Facility identities.'
                : 'Populates Box 32. Box 33 automatically mirrors its organization name and NPI.'}
            </p>
          </div>

          {/* Box 1 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>1. Insurance Type</label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked disabled className={`w-4 h-4 ${REQUIRED_FIELD_CLASS}`} />
              <span className="text-sm">COMMERCIAL INSURANCE (CI)</span>
            </label>
          </div>

          {/* Box 1a */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>1a. INSURED'S I.D. NUMBER</label>
            <input
              type="text"
              value={patient?.memberId || ''}
              onChange={(e) => updateField([patientFieldRoot, 'memberId'], e.target.value)}
              maxLength={29}
              className={`w-full p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
            />
            <p className="mt-1 text-xs text-gray-500">
              Patient-provided member ID; submitted as <code>subscriber.memberId</code> for Self and <code>dependent.memberId</code> for Spouse, Child, or Other.
            </p>
          </div>

          {/* Box 2 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>2. PATIENT'S NAME (Last Name, First Name, Middle Initial, Suffix)</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <input
                type="text"
                value={patient?.lastName ?? ''}
                onChange={(e) => updateField([patientFieldRoot, 'lastName'], e.target.value)}
                placeholder="Last Name"
                className={`p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
              />
              <input
                type="text"
                value={patient?.firstName ?? ''}
                onChange={(e) => updateField([patientFieldRoot, 'firstName'], e.target.value)}
                placeholder="First Name"
                className={`p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
              />
              <input
                type="text"
                value={patient?.middleName ?? ''}
                onChange={(e) => updateField([patientFieldRoot, 'middleName'], e.target.value)}
                placeholder="MI"
                maxLength={1}
                className={`p-2 border rounded ${OPTIONAL_FIELD_CLASS}`}
              />
              <input
                type="text"
                value={patient?.suffix ?? ''}
                onChange={(e) => updateField([patientFieldRoot, 'suffix'], e.target.value)}
                placeholder="Suffix"
                className={`p-2 border rounded ${OPTIONAL_FIELD_CLASS}`}
              />
            </div>
          </div>

          {/* Box 3 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>3. PATIENT'S BIRTH DATE</label>
            <div className="flex items-center gap-4">
              <input
                type="date"
                value={patient?.dateOfBirth ? formatDateForInput(patient.dateOfBirth) : ''}
                onChange={(e) => updateField([patientFieldRoot, 'dateOfBirth'], e.target.value)}
                className={`p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
              />
              <div className="flex items-center gap-4">
                <span className={`text-sm font-bold ${REQUIRED_LABEL_CLASS}`}>SEX</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={patient?.gender === 'M'}
                    onChange={() => updateField([patientFieldRoot, 'gender'], 'M')}
                    className={`w-4 h-4 ${REQUIRED_FIELD_CLASS}`}
                  />
                  <span className="text-sm">M</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={patient?.gender === 'F'}
                    onChange={() => updateField([patientFieldRoot, 'gender'], 'F')}
                    className={`w-4 h-4 ${REQUIRED_FIELD_CLASS}`}
                  />
                  <span className="text-sm">F</span>
                </label>
              </div>
            </div>
          </div>

          {/* Box 4 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>4. INSURED'S NAME (Last Name, First Name, Middle Initial, Suffix)</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <input
                type="text"
                value={formData.subscriber?.lastName ?? ''}
                onChange={(e) => updateField(['subscriber', 'lastName'], e.target.value)}
                placeholder="Last Name"
                className={`p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
              />
              <input
                type="text"
                value={formData.subscriber?.firstName ?? ''}
                onChange={(e) => updateField(['subscriber', 'firstName'], e.target.value)}
                placeholder="First Name"
                className={`p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
              />
              <input
                type="text"
                value={formData.subscriber?.middleName ?? ''}
                onChange={(e) => updateField(['subscriber', 'middleName'], e.target.value)}
                placeholder="MI"
                maxLength={1}
                className={`p-2 border rounded ${OPTIONAL_FIELD_CLASS}`}
              />
              <input
                type="text"
                value={formData.subscriber?.suffix ?? ''}
                onChange={(e) => updateField(['subscriber', 'suffix'], e.target.value)}
                placeholder="Suffix"
                className={`p-2 border rounded ${OPTIONAL_FIELD_CLASS}`}
              />
            </div>
          </div>

          {/* Box 5 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>5. PATIENT'S ADDRESS</label>
            <div className="space-y-2">
              <input
                type="text"
                value={patient?.address?.address1 ?? ''}
                onChange={(e) => updateField([patientFieldRoot, 'address', 'address1'], e.target.value)}
                placeholder="Address Line 1"
                className={`w-full p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
              />
              <input
                type="text"
                value={patient?.address?.address2 ?? ''}
                onChange={(e) => updateField([patientFieldRoot, 'address', 'address2'], e.target.value)}
                placeholder="Address Line 2"
                className={`w-full p-2 border rounded ${OPTIONAL_FIELD_CLASS}`}
              />
              <div className="grid grid-cols-3 gap-4">
                <input
                  type="text"
                  value={patient?.address?.city ?? ''}
                  onChange={(e) => updateField([patientFieldRoot, 'address', 'city'], e.target.value)}
                  placeholder="City"
                  className={`p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
                />
                <select
                  value={patient?.address?.state ?? ''}
                  onChange={(e) => updateField([patientFieldRoot, 'address', 'state'], e.target.value)}
                  className={`p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
                >
                  <option value="">State</option>
                  {US_STATES.map(state => (
                    <option
                      key={state.code}
                      value={isOptumSandbox ? state.code.toLowerCase() : state.code}
                    >
                      {state.code} - {state.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={patient?.address?.postalCode ?? ''}
                  onChange={(e) => updateField([patientFieldRoot, 'address', 'postalCode'], e.target.value.replace(/\D/g, '').slice(0, 9))}
                  placeholder="ZIP Code"
                  className={`p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
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
                className={`w-full p-2 border rounded ${OPTIONAL_FIELD_CLASS}`}
              />
            </div>
          </div>

          {/* Box 6 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>6. PATIENT RELATIONSHIP TO INSURED</label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={patientIsSubscriber}
                  onChange={(e) => e.target.checked && setPatientRelationship('18')}
                  className={`w-4 h-4 ${REQUIRED_FIELD_CLASS}`}
                />
                <span className="text-sm">Self</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.dependent?.relationshipToSubscriberCode === '01'}
                  onChange={(e) => e.target.checked && setPatientRelationship('01')}
                  className={`w-4 h-4 ${REQUIRED_FIELD_CLASS}`}
                />
                <span className="text-sm">Spouse</span>
              </label>
              <label
                className={`flex items-center gap-2 ${isOptumSandbox ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer'}`}
                title={isOptumSandbox ? "Optum's published canned claim uses the spouse relationship" : undefined}
              >
                <input
                  type="checkbox"
                  checked={formData.dependent?.relationshipToSubscriberCode === '19'}
                  onChange={(e) => e.target.checked && setPatientRelationship('19')}
                  disabled={isOptumSandbox}
                  className={`w-4 h-4 ${REQUIRED_FIELD_CLASS}`}
                />
                <span className="text-sm">Child</span>
              </label>
              <label
                className={`flex items-center gap-2 ${isOptumSandbox ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer'}`}
                title={isOptumSandbox ? "Optum's published canned claim uses the spouse relationship" : undefined}
              >
                <input
                  type="checkbox"
                  checked={formData.dependent?.relationshipToSubscriberCode === 'G8'}
                  onChange={(e) => e.target.checked && setPatientRelationship('G8')}
                  disabled={isOptumSandbox}
                  className={`w-4 h-4 ${REQUIRED_FIELD_CLASS}`}
                />
                <span className="text-sm">Other</span>
              </label>
            </div>
            {isOptumSandbox && (
              <p className="mt-2 text-xs text-gray-500">
                Sandbox testing uses Optum&apos;s published Self/Spouse canned identities; Child and Other remain available in production.
              </p>
            )}
          </div>

          {/* Box 7 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>7. INSURED'S ADDRESS</label>
            <div className="space-y-2">
              <input
                type="text"
                value={formData.subscriber?.address?.address1 || ''}
                onChange={(e) => updateField(['subscriber', 'address', 'address1'], e.target.value)}
                placeholder="Address Line 1"
                className={`w-full p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
              />
              <input
                type="text"
                value={formData.subscriber?.address?.address2 || ''}
                onChange={(e) => updateField(['subscriber', 'address', 'address2'], e.target.value)}
                placeholder="Address Line 2"
                className={`w-full p-2 border rounded ${OPTIONAL_FIELD_CLASS}`}
              />
              <div className="grid grid-cols-3 gap-4">
                <input
                  type="text"
                  value={formData.subscriber?.address?.city || ''}
                  onChange={(e) => updateField(['subscriber', 'address', 'city'], e.target.value)}
                  placeholder="City"
                  className={`p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
                />
                <select
                  value={formData.subscriber?.address?.state || ''}
                  onChange={(e) => updateField(['subscriber', 'address', 'state'], e.target.value)}
                  className={`p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
                >
                  <option value="">State</option>
                  {US_STATES.map(state => (
                    <option
                      key={state.code}
                      value={isOptumSandbox ? state.code.toLowerCase() : state.code}
                    >
                      {state.code} - {state.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={formData.subscriber?.address?.postalCode || ''}
                  onChange={(e) => updateField(['subscriber', 'address', 'postalCode'], e.target.value)}
                  placeholder="ZIP Code"
                  className={`p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
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
                className={`w-full p-2 border rounded ${OPTIONAL_FIELD_CLASS}`}
              />
            </div>
          </div>

          {/* Box 8 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>8. RESERVED FOR NUCC USE</label>
            <div className="text-sm text-gray-500 italic">Reserved field</div>
          </div>

          {/* Box 9 */}
          <div className={`pb-3 ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'opacity-50 bg-gray-50' : ''}`}>
            <label className={`text-sm font-bold mb-2 block ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'text-gray-400' : OPTIONAL_LABEL_CLASS}`}>
              9. OTHER INSURED'S NAME (Last Name, First Name, Middle Initial)
              {formData.claimInformation?.hasOtherHealthBenefitPlan === false && <span className="ml-2 text-xs text-gray-500">(Disabled - No other health benefit plan)</span>}
            </label>
            <div className="grid grid-cols-3 gap-4">
              <input 
                type="text" 
                placeholder="Last Name" 
                className={`p-2 border rounded ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? NOT_APPLICABLE_FIELD_CLASS : OPTIONAL_FIELD_CLASS}`}
                disabled={formData.claimInformation?.hasOtherHealthBenefitPlan === false} 
              />
              <input 
                type="text" 
                placeholder="First Name" 
                className={`p-2 border rounded ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? NOT_APPLICABLE_FIELD_CLASS : OPTIONAL_FIELD_CLASS}`}
                disabled={formData.claimInformation?.hasOtherHealthBenefitPlan === false} 
              />
              <input 
                type="text" 
                placeholder="MI" 
                maxLength={1} 
                className={`p-2 border rounded ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? NOT_APPLICABLE_FIELD_CLASS : OPTIONAL_FIELD_CLASS}`}
                disabled={formData.claimInformation?.hasOtherHealthBenefitPlan === false} 
              />
            </div>
          </div>

          {/* Box 9a */}
          <div className={`pb-3 ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'opacity-50 bg-gray-50' : ''}`}>
            <label className={`text-sm font-bold mb-2 block ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'text-gray-400' : OPTIONAL_LABEL_CLASS}`}>
              9a. OTHER INSURED'S POLICY OR GROUP NUMBER
              {formData.claimInformation?.hasOtherHealthBenefitPlan === false && <span className="ml-2 text-xs text-gray-500">(Disabled - No other health benefit plan)</span>}
            </label>
            <input 
              type="text" 
              className={`w-full p-2 border rounded ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? NOT_APPLICABLE_FIELD_CLASS : OPTIONAL_FIELD_CLASS}`}
              disabled={formData.claimInformation?.hasOtherHealthBenefitPlan === false} 
            />
          </div>

          {/* Box 9b */}
          <div className={`pb-3 ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'opacity-50 bg-gray-50' : ''}`}>
            <label className={`text-sm font-bold mb-2 block ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'text-gray-400' : OPTIONAL_LABEL_CLASS}`}>
              9b. RESERVED FOR NUCC USE
            </label>
            <div className="text-sm text-gray-500 italic">Reserved field</div>
          </div>

          {/* Box 9c */}
          <div className={`pb-3 ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'opacity-50 bg-gray-50' : ''}`}>
            <label className={`text-sm font-bold mb-2 block ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'text-gray-400' : OPTIONAL_LABEL_CLASS}`}>
              9c. RESERVED FOR NUCC USE
            </label>
            <div className="text-sm text-gray-500 italic">Reserved field</div>
          </div>

          {/* Box 9d */}
          <div className={`pb-3 ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'opacity-50 bg-gray-50' : ''}`}>
            <label className={`text-sm font-bold mb-2 block ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? 'text-gray-400' : OPTIONAL_LABEL_CLASS}`}>
              9d. INSURANCE PLAN NAME OR PROGRAM NAME
              {formData.claimInformation?.hasOtherHealthBenefitPlan === false && <span className="ml-2 text-xs text-gray-500">(Disabled - No other health benefit plan)</span>}
            </label>
            <input 
              type="text" 
              className={`w-full p-2 border rounded ${formData.claimInformation?.hasOtherHealthBenefitPlan === false ? NOT_APPLICABLE_FIELD_CLASS : OPTIONAL_FIELD_CLASS}`}
              disabled={formData.claimInformation?.hasOtherHealthBenefitPlan === false} 
            />
          </div>

          {/* Box 10 */}
          <div className="pb-3 opacity-60">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>10. IS PATIENT'S CONDITION RELATED TO:</label>
            <p className="text-sm text-gray-600">No — accident, employment, and other conditional claims are outside this form's supported workflow.</p>
          </div>

          {/* Box 10d */}
          <div className="pb-3 opacity-60">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>10d. CLAIM CODES (Designated by NUCC)</label>
            <p className="text-sm text-gray-600">Not applicable to the supported claim type.</p>
          </div>

          {/* Box 11 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${OPTIONAL_LABEL_CLASS}`}>11. INSURED'S POLICY GROUP OR FECA NUMBER</label>
            <input
              type="text"
              value={formData.subscriber?.groupNumber || ''}
              onChange={(e) => updateField(['subscriber', 'groupNumber'], e.target.value)}
              className={`w-full p-2 border rounded ${OPTIONAL_FIELD_CLASS}`}
            />
          </div>

          {/* Box 11a */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>11a. INSURED'S DATE OF BIRTH</label>
            <div className="flex items-center gap-4">
              <input
                type="date"
                value={formData.subscriber?.dateOfBirth ? formatDateForInput(formData.subscriber.dateOfBirth) : ''}
                onChange={(e) => updateField(['subscriber', 'dateOfBirth'], e.target.value)}
                className={`p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
              />
              <div className="flex items-center gap-4">
                <span className={`text-sm font-bold ${REQUIRED_LABEL_CLASS}`}>SEX</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.subscriber?.gender === 'M'}
                    onChange={() => updateField(['subscriber', 'gender'], 'M')}
                    className={`w-4 h-4 ${REQUIRED_FIELD_CLASS}`}
                  />
                  <span className="text-sm">M</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.subscriber?.gender === 'F'}
                    onChange={() => updateField(['subscriber', 'gender'], 'F')}
                    className={`w-4 h-4 ${REQUIRED_FIELD_CLASS}`}
                  />
                  <span className="text-sm">F</span>
                </label>
              </div>
            </div>
          </div>

          {/* Box 11b */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>11b. OTHER CLAIM ID</label>
            <input
              type="text"
              value="Not applicable"
              disabled
              className={`w-full p-2 border rounded ${NOT_APPLICABLE_FIELD_CLASS}`}
            />
          </div>

          {/* Box 11c */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>11c. INSURANCE PLAN NAME</label>
            <input
              type="text"
              value="Not applicable"
              disabled
              className={`w-full p-2 border rounded ${NOT_APPLICABLE_FIELD_CLASS}`}
            />
          </div>

          {/* Box 11d */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${OPTIONAL_LABEL_CLASS}`}>11d. Is there another health benefit plan?</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={false} disabled className={`w-4 h-4 ${OPTIONAL_FIELD_CLASS}`} />
                <span className="text-sm">YES</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked disabled className={`w-4 h-4 ${OPTIONAL_FIELD_CLASS}`} />
                <span className="text-sm">NO</span>
              </label>
              <span className="text-xs text-gray-500 self-center">Primary commercial claims only</span>
            </div>
          </div>

          {/* Box 12 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${OPTIONAL_LABEL_CLASS}`}>12. PATIENT'S OR AUTHORIZED PERSON'S SIGNATURE</label>
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={patientSignatureOnFile}
                onChange={(e) => setPatientSignatureOnFile(e.target.checked)}
                className={`w-4 h-4 ${OPTIONAL_FIELD_CLASS}`}
              />
              <span className="text-sm">Signature on File</span>
            </label>
          </div>

          {/* Box 13 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${OPTIONAL_LABEL_CLASS}`}>13. INSURED'S OR AUTHORIZED PERSON'S SIGNATURE</label>
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={authorizedSignatureOnFile}
                onChange={(e) => setAuthorizedSignatureOnFile(e.target.checked)}
                className={`w-4 h-4 ${OPTIONAL_FIELD_CLASS}`}
              />
              <span className="text-sm">Signature on File</span>
            </label>
          </div>

          {/* Box 14 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>14. DATE OF CURRENT ILLNESS, INJURY, or PREGNANCY (LMP)</label>
            <input type="text" value="Not applicable" disabled className={`w-full p-2 border rounded ${NOT_APPLICABLE_FIELD_CLASS}`} />
          </div>

          {/* Box 15 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>15. OTHER DATE</label>
            <input type="text" value="Not applicable" disabled className={`w-full p-2 border rounded ${NOT_APPLICABLE_FIELD_CLASS}`} />
          </div>

          {/* Box 16 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>16. Dates patient unable to work in current occupation</label>
            <input type="text" value="Not applicable" disabled className={`w-full p-2 border rounded ${NOT_APPLICABLE_FIELD_CLASS}`} />
          </div>

          {/* Box 17 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>17. NAME OF REFERRING PROVIDER OR OTHER SOURCE</label>
            <input type="text" value="Not applicable" disabled className={`w-full p-2 border rounded ${NOT_APPLICABLE_FIELD_CLASS}`} />
          </div>

          {/* Box 17a */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>17a. OTHER ID</label>
            <input
              type="text"
              value="Not applicable"
              disabled
              className={`w-full p-2 border rounded ${NOT_APPLICABLE_FIELD_CLASS}`}
            />
          </div>

          {/* Box 17b */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>17b. NPI</label>
            <input
              type="text"
              value="Not applicable"
              disabled
              className={`w-full p-2 border rounded ${NOT_APPLICABLE_FIELD_CLASS}`}
            />
          </div>

          {/* Box 18 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>18. Hospitalization Dates Related to Current Services</label>
            <input type="text" value="Not applicable" disabled className={`w-full p-2 border rounded ${NOT_APPLICABLE_FIELD_CLASS}`} />
          </div>

          {/* Box 19 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>19. ADDITIONAL CLAIM INFORMATION (Designated by NUCC)</label>
            <input
              type="text"
              value="Not applicable"
              disabled
              className={`w-full p-2 border rounded ${NOT_APPLICABLE_FIELD_CLASS}`}
            />
          </div>

          {/* Box 20 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${OPTIONAL_LABEL_CLASS}`}>20. OUTSIDE LAB?</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={false} disabled className={`w-4 h-4 ${OPTIONAL_FIELD_CLASS}`} />
                <span className="text-sm">YES</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked disabled className={`w-4 h-4 ${OPTIONAL_FIELD_CLASS}`} />
                <span className="text-sm">NO</span>
              </label>
            </div>
          </div>

          {/* Box 21 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>21. DIAGNOSIS OR NATURE OF ILLNESS OR INJURY Relate A-L to service line below (24E)</label>
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => (
                <div key={i}>
                  <label className={`text-sm font-semibold ${requiredDiagnosisIndexes.has(i) ? REQUIRED_LABEL_CLASS : OPTIONAL_LABEL_CLASS}`}>{String.fromCharCode(65 + i)}.</label>
                  <input
                    type="text"
                    value={diagnoses[i]?.diagnosisCode || ''}
                    onChange={(e) => updateDiagnosis(i, e.target.value)}
                    className={`w-full p-2 border rounded mt-1 ${requiredDiagnosisIndexes.has(i) ? REQUIRED_FIELD_CLASS : OPTIONAL_FIELD_CLASS}`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <label className={`text-sm font-semibold ${OPTIONAL_LABEL_CLASS}`} htmlFor="icd-indicator">ICD Indicator</label>
              <input
                id="icd-indicator"
                type="text"
                value="0"
                readOnly
                className={`w-16 p-2 border rounded bg-gray-50 text-center ${OPTIONAL_FIELD_CLASS}`}
                title="ICD-10-CM"
              />
              <span className="text-xs text-gray-500">ICD-10-CM</span>
            </div>
          </div>

          {/* Box 22 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>22. RESUBMISSION CODE</label>
            <div className="grid grid-cols-2 gap-4">
              <select
                value="1"
                disabled
                className={`p-2 border rounded bg-gray-100 cursor-not-allowed ${REQUIRED_FIELD_CLASS}`}
              >
                <option value="1">1 - New claim</option>
              </select>
              <input
                type="text"
                value="Not applicable"
                disabled
                aria-label="Original payer claim control number"
                className={`p-2 border rounded ${NOT_APPLICABLE_FIELD_CLASS}`}
              />
            </div>
          </div>

          {/* Box 23 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>23. PRIOR AUTHORIZATION NUMBER</label>
            <div className="grid grid-cols-[5rem_1fr] gap-2">
              <input
                type="text"
                value="N/A"
                disabled
                aria-label="Prior authorization qualifier"
                className={`p-2 border rounded text-center ${NOT_APPLICABLE_FIELD_CLASS}`}
              />
              <input
                type="text"
                value="Not applicable"
                disabled
                className={`w-full p-2 border rounded ${NOT_APPLICABLE_FIELD_CLASS}`}
              />
            </div>
          </div>

          {/* Box 24 - Service Lines */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>
              24. Services
            </label>
            <div className="space-y-3 mt-3">
              {effectiveServiceLines.map((line, index) => {
                const selectedProcedure = PROCEDURE_OPTIONS.find(
                  (option) => option.code === line.professionalService?.procedureCode
                );
                const renderingProviderIsPresent = hasProviderIdentity(line.renderingProvider);
                const renderingProviderNpiIsRequired = !isOptumSandbox || renderingProviderIsPresent;
                const renderingProviderFirstNameIsRequired = Boolean(
                  !isOptumSandbox || (renderingProviderIsPresent && !line.renderingProvider?.lastName)
                );
                const renderingProviderLastNameIsRequired = Boolean(
                  !isOptumSandbox || (renderingProviderIsPresent && !line.renderingProvider?.firstName)
                );
                const requiresClia = line.professionalService?.procedureModifiers?.includes('QW') || false;

                return (
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
                      <label className={`text-xs font-semibold block mb-1 flex items-center gap-1 ${REQUIRED_LABEL_CLASS}`}>
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
                        value={formatDateForInput(line.serviceDate || '')}
                        onChange={(e) => updateAllServiceDates(e.target.value.replace(/-/g, ''))}
                        className={`w-full px-1.5 py-1.5 border rounded text-sm ${REQUIRED_FIELD_CLASS}`}
                      />
                    </div>

                    {/* a. TO */}
                    <div className="col-span-6 sm:col-span-2" style={{ maxWidth: 'calc(100% - 20px)' }}>
                      <label className={`text-xs font-semibold block mb-1 flex items-center gap-1 ${OPTIONAL_LABEL_CLASS}`}>
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
                        value={formatDateForInput(line.serviceDate || '')}
                        disabled
                        className={`w-full px-1.5 py-1.5 border rounded text-sm bg-gray-100 cursor-not-allowed ${OPTIONAL_FIELD_CLASS}`}
                      />
                    </div>

                    {/* b. Place of Service */}
                    <div className="col-span-3 sm:col-span-1">
                      <label className={`text-xs font-semibold block mb-1 flex items-center gap-1 ${REQUIRED_LABEL_CLASS}`}>
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
                        value="10"
                        disabled
                        title="Place of service 10 — Telehealth provided in patient's home"
                        className={`w-full p-1.5 border rounded text-sm text-center bg-gray-100 cursor-not-allowed ${REQUIRED_FIELD_CLASS}`}
                      />
                    </div>

                    {/* c. EMG */}
                    <div className="col-span-3 sm:col-span-1">
                      <label className={`text-xs font-semibold block mb-1 flex items-center gap-1 ${OPTIONAL_LABEL_CLASS}`}>
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
                          checked={false}
                          disabled
                          className={`w-4 h-4 rounded ${OPTIONAL_FIELD_CLASS}`}
                        />
                      </div>
                    </div>

                    {/* d. CPT/HCPCS */}
                    <div className="col-span-6 sm:col-span-3">
                      <label className={`text-xs font-semibold block mb-1 flex items-center gap-1 ${REQUIRED_LABEL_CLASS}`}>
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
                      <select
                        value={line.professionalService?.procedureCode || ''}
                        onChange={(e) => updateServiceLineProcedure(index, e.target.value)}
                        className={`w-full p-1.5 border rounded text-sm ${REQUIRED_FIELD_CLASS}`}
                      >
                        <option value="">Select procedure</option>
                        {line.professionalService?.procedureCode && !selectedProcedure && (
                          <option value={line.professionalService.procedureCode}>
                            {line.professionalService.procedureCode} — Saved procedure
                          </option>
                        )}
                        {PROCEDURE_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>{option.label}</option>
                        ))}
                      </select>
                      {selectedProcedure && (
                        <p className="mt-1 text-[11px] leading-tight text-gray-600">{selectedProcedure.hint}</p>
                      )}
                    </div>

                    {/* d. Modifier */}
                    <div className="col-span-6 sm:col-span-1">
                      <label className={`text-xs font-semibold block mb-1 flex items-center gap-1 ${OPTIONAL_LABEL_CLASS}`}>
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
                          updateServiceLineAt(index, (currentLine) => ({
                            ...currentLine,
                            professionalService: {
                              ...currentLine.professionalService,
                              procedureModifiers: modifiers.length > 0 ? modifiers : undefined
                            }
                          }));
                        }}
                        placeholder="95 GT"
                        maxLength={11}
                        className={`w-full p-1.5 border rounded text-sm ${OPTIONAL_FIELD_CLASS}`}
                      />
                    </div>

                    {/* e. Diagnosis Pointer */}
                    <div className="col-span-6 sm:col-span-2">
                      <label className={`text-xs font-semibold block mb-1 flex items-center gap-1 ${REQUIRED_LABEL_CLASS}`}>
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
                          updateServiceLineAt(index, (currentLine) => ({
                            ...currentLine,
                            professionalService: {
                              ...currentLine.professionalService,
                              compositeDiagnosisCodePointers: {
                                diagnosisCodePointers: pointers
                              }
                            }
                          }));
                        }}
                        placeholder="A"
                        maxLength={4}
                        className={`w-full p-1.5 border rounded text-sm ${REQUIRED_FIELD_CLASS}`}
                      />
                    </div>
                  </div>

                  {/* Row 2: Charges, Units, EPSDT, ID Qual, Provider ID */}
                  <div className="grid grid-cols-12 gap-2">
                    {/* f. Charges */}
                    <div className="col-span-6 sm:col-span-3">
                      <label className={`text-xs font-semibold block mb-1 flex items-center gap-1 ${REQUIRED_LABEL_CLASS}`}>
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
                          className={`flex-1 p-1.5 border rounded text-sm ${REQUIRED_FIELD_CLASS}`}
                        />
                      </div>
                    </div>

                    {/* g. Days or Units */}
                    <div className="col-span-6 sm:col-span-2">
                      <label className={`text-xs font-semibold block mb-1 flex items-center gap-1 ${REQUIRED_LABEL_CLASS}`}>
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
                        className={`w-full p-1.5 border rounded text-sm text-center ${REQUIRED_FIELD_CLASS}`}
                      />
                    </div>

                    {/* h. EPSDT */}
                    <div className="col-span-4 sm:col-span-1">
                      <label className={`text-xs font-semibold block mb-1 flex items-center gap-1 ${OPTIONAL_LABEL_CLASS}`}>
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
                          updateServiceLineAt(index, (currentLine) => ({
                            ...currentLine,
                            professionalService: {
                              ...currentLine.professionalService,
                              epsdtIndicator: value === 'Y' ? 'Y' : undefined
                            }
                          }));
                        }}
                        maxLength={1}
                        placeholder="N"
                        className={`w-full p-1.5 border rounded text-sm text-center ${OPTIONAL_FIELD_CLASS}`}
                      />
                    </div>

                    {/* h. Family Planning */}
                    <div className="col-span-4 sm:col-span-1">
                      <label className={`text-xs font-semibold block mb-1 flex items-center gap-1 ${OPTIONAL_LABEL_CLASS}`}>
                        h. FP
                        <div className="relative group inline-block">
                          <span className="text-gray-400 cursor-help text-xs">ⓘ</span>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                            <div className="font-semibold mb-1">Family Planning Indicator</div>
                            <div>Enter Y when the service is related to family planning.</div>
                          </div>
                        </div>
                      </label>
                      <input
                        type="text"
                        value={line.professionalService?.familyPlanningIndicator || ''}
                        onChange={(e) => {
                          const value = e.target.value.toUpperCase().replace(/[^Y]/g, '').slice(0, 1);
                          updateServiceLineAt(index, (currentLine) => ({
                            ...currentLine,
                            professionalService: {
                              ...currentLine.professionalService,
                              familyPlanningIndicator: value === 'Y' ? 'Y' : undefined
                            }
                          }));
                        }}
                        maxLength={1}
                        placeholder="N"
                        className={`w-full p-1.5 border rounded text-sm text-center ${OPTIONAL_FIELD_CLASS}`}
                      />
                    </div>

                    {/* i. ID. Qual */}
                    <div className="col-span-4 sm:col-span-2">
                      <label className={`text-xs font-semibold block mb-1 flex items-center gap-1 ${OPTIONAL_LABEL_CLASS}`}>
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
                        className={`w-full p-1.5 border rounded text-sm bg-gray-50 ${OPTIONAL_FIELD_CLASS}`}
                        disabled
                      >
                        <option value="NPI">NPI</option>
                      </select>
                    </div>

                    {/* j. Rendering Provider ID */}
                    <div className="col-span-12 sm:col-span-3">
                      <label className={`text-xs font-semibold block mb-1 flex items-center gap-1 ${renderingProviderNpiIsRequired ? REQUIRED_LABEL_CLASS : OPTIONAL_LABEL_CLASS}`}>
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
                          updateServiceLineAt(index, (currentLine) => ({
                            ...currentLine,
                            renderingProvider: {
                              ...currentLine.renderingProvider,
                              providerType: 'RenderingProvider',
                              npi: value
                            }
                          }));
                        }}
                        placeholder="NPI (10 digits)"
                        maxLength={10}
                        className={`w-full p-1.5 border rounded text-sm ${renderingProviderNpiIsRequired ? REQUIRED_FIELD_CLASS : OPTIONAL_FIELD_CLASS}`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                    <input
                      type="text"
                      value={line.renderingProvider?.firstName || ''}
                      onChange={(e) => {
                        updateServiceLineAt(index, (currentLine) => ({
                          ...currentLine,
                          renderingProvider: {
                            ...currentLine.renderingProvider,
                            providerType: 'RenderingProvider',
                            firstName: e.target.value
                          }
                        }));
                      }}
                      placeholder="Rendering provider first name"
                      className={`p-1.5 border rounded text-sm ${renderingProviderFirstNameIsRequired ? REQUIRED_FIELD_CLASS : OPTIONAL_FIELD_CLASS}`}
                    />
                    <input
                      type="text"
                      value={line.renderingProvider?.lastName || ''}
                      onChange={(e) => {
                        updateServiceLineAt(index, (currentLine) => ({
                          ...currentLine,
                          renderingProvider: {
                            ...currentLine.renderingProvider,
                            providerType: 'RenderingProvider',
                            lastName: e.target.value
                          }
                        }));
                      }}
                      placeholder="Rendering provider last name"
                      className={`p-1.5 border rounded text-sm ${renderingProviderLastNameIsRequired ? REQUIRED_FIELD_CLASS : OPTIONAL_FIELD_CLASS}`}
                    />
                    <input
                      type="text"
                      value={line.renderingProvider?.taxonomyCode || ''}
                      onChange={(e) => {
                        updateServiceLineAt(index, (currentLine) => ({
                          ...currentLine,
                          renderingProvider: {
                            ...currentLine.renderingProvider,
                            providerType: 'RenderingProvider',
                            taxonomyCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
                          }
                        }));
                      }}
                      placeholder="Rendering taxonomy"
                      maxLength={10}
                      className={`p-1.5 border rounded text-sm ${OPTIONAL_FIELD_CLASS}`}
                    />
                  </div>
                  {requiresClia && (
                    <div className="mt-2">
                      <label className={`text-xs font-semibold block mb-1 ${isOptumSandbox ? OPTIONAL_LABEL_CLASS : REQUIRED_LABEL_CLASS}`}>
                        CLIA number (X4 service-line reference)
                      </label>
                      <input
                        type="text"
                        value={isOptumSandbox
                          ? ''
                          : (line.serviceLineReferenceInformation?.clinicalLaboratoryImprovementAmendmentNumber || '')}
                        onChange={(e) => {
                          const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
                          updateServiceLineAt(index, (currentLine) => ({
                            ...currentLine,
                            serviceLineReferenceInformation: value
                              ? { clinicalLaboratoryImprovementAmendmentNumber: value }
                              : undefined
                          }));
                        }}
                        disabled={isOptumSandbox}
                        placeholder={isOptumSandbox ? 'Omitted for Optum canned sandbox fixture' : REPERIO_DEFAULT_CLIA_NUMBER}
                        maxLength={10}
                        className={`w-full p-1.5 border rounded text-sm ${isOptumSandbox ? NOT_APPLICABLE_FIELD_CLASS : REQUIRED_FIELD_CLASS}`}
                      />
                    </div>
                  )}
                </div>
                );
              })}
              {effectiveServiceLines.length < MAX_SERVICE_LINES ? (
                <button
                  type="button"
                  onClick={addServiceLine}
                  className="w-full px-3 py-2 bg-[#9e32e2] text-white rounded hover:bg-[#8a2bc9] text-sm font-semibold"
                >
                  + Add Service Line
                </button>
              ) : (
                <p className="text-xs text-gray-500 text-center">
                  Maximum of {MAX_SERVICE_LINES} service lines reached.
                </p>
              )}
            </div>
          </div>

          {/* Box 25 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>25. FEDERAL TAX I.D. NUMBER</label>
            <div className="space-y-2">
              <div className="flex gap-4 mb-2">
                <label className="flex items-center gap-2 text-gray-600">
                  <input
                    type="checkbox"
                    checked={false}
                    disabled
                    className="w-4 h-4"
                  />
                  <span className="text-sm">SSN</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    className={`w-4 h-4 ${REQUIRED_FIELD_CLASS}`}
                  />
                  <span className="text-sm">EIN</span>
                </label>
              </div>
              <div>
                <input
                  type="text"
                  list="billing-ein-options"
                  value={formData.billing?.employerId || ''}
                  onChange={(e) => updateField(['billing', 'employerId'], e.target.value.replace(/\D/g, '').slice(0, 9))}
                  placeholder="9-digit EIN"
                  maxLength={9}
                  inputMode="numeric"
                  className={`w-full p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
                />
                <datalist id="billing-ein-options">
                  <option value="994567305">RHMG, PLLC</option>
                  <option value="394343101">RHMG, LLC - NJ</option>
                  <option value="394724400">Alexander Marsh, M.D., PC</option>
                </datalist>
                {formData.billing?.employerId && !validateSSN(formData.billing.employerId) && (
                  <p className="text-xs text-red-500 mt-1">EIN must be 9 digits</p>
                )}
              </div>
            </div>
          </div>

          {/* Box 26 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>26. PATIENT'S ACCOUNT NO.</label>
            {isOptumSandbox ? (
              <input
                type="text"
                value={formData.claimInformation?.patientControlNumber || ''}
                disabled
                className={`w-full p-2 border rounded bg-amber-50 cursor-not-allowed ${REQUIRED_FIELD_CLASS}`}
              />
            ) : (
              <div className={`flex overflow-hidden border rounded ${REQUIRED_FIELD_CLASS}`}>
                <span className="flex items-center bg-gray-100 px-3 text-sm font-semibold border-r border-current">RC-</span>
                <input
                  type="text"
                  value={patientAccountDigits(formData.claimInformation?.patientControlNumber)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 12);
                    updateField(['claimInformation', 'patientControlNumber'], digits ? `RC-${digits}` : '');
                  }}
                  placeholder="12 digits"
                  maxLength={12}
                  inputMode="numeric"
                  pattern="[1-9][0-9]{11}"
                  required
                  className="w-full p-2 outline-none text-inherit"
                />
              </div>
            )}
            <p className="mt-1 text-xs text-gray-700">
              Not Reperio Health Patient account number. Represents provider/submitter-assigned identifier used to reconcile the submitted claim with claim-status and payment information. Tied to the visit.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {isOptumSandbox
                ? 'Sandbox-only canned value. Production requires RC- followed by 12 digits whose first digit is non-zero.'
                : 'Enter 12 digits; the first digit cannot be zero. The RC- prefix is added automatically.'}
            </p>
          </div>

          {/* Box 27 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>27. ACCEPT ASSIGNMENT?</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked
                  disabled
                  className={`w-4 h-4 ${REQUIRED_FIELD_CLASS}`}
                />
                <span className="text-sm">YES — Accept</span>
              </label>
              <label className="flex items-center gap-2 text-gray-600">
                <input
                  type="checkbox"
                  checked={false}
                  disabled
                  className="w-4 h-4"
                />
                <span className="text-sm">NO</span>
              </label>
            </div>
          </div>

          {/* Box 28 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>28. TOTAL CHARGE</label>
            <div className="flex items-center gap-2">
              <span className="text-sm">$</span>
              <input
                type="text"
                value={formatCurrency(String(sumServiceLineChargeCents(effectiveServiceLines))) || '0.00'}
                readOnly
                placeholder="0.00"
                className={`w-full p-2 border rounded bg-gray-50 cursor-not-allowed ${REQUIRED_FIELD_CLASS}`}
                title="Auto-calculated from service line charges"
              />
            </div>
          </div>

          {/* Box 29 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${OPTIONAL_LABEL_CLASS}`}>29. AMOUNT PAID</label>
            <input
              type="text"
              value="$0.00"
              disabled
              className="w-full p-2 border border-gray-400 rounded bg-gray-200 text-gray-600 cursor-not-allowed"
            />
          </div>

          {/* Box 30 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${NOT_APPLICABLE_LABEL_CLASS}`}>30. Rsvd for NUCC Use</label>
            <div className="text-sm text-gray-500 italic">Reserved field</div>
          </div>

          {/* Box 31 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>31. SIGNATURE OF PHYSICIAN OR SUPPLIER</label>
            <label className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked
                disabled
                className={`w-4 h-4 ${REQUIRED_FIELD_CLASS}`}
              />
              <span className="text-sm">Signature on File</span>
            </label>
            <label className={`text-xs font-semibold block mt-3 mb-1 ${REQUIRED_LABEL_CLASS}`}>Date signed</label>
            <input
              type="date"
              value={physicianSignatureDate}
              onChange={(e) => setPhysicianSignatureDate(e.target.value)}
              required
              className={`w-full p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
            />
            <p className="mt-1 text-xs text-gray-500">Required by this form workflow; retained with the draft and not sent as an unsupported Optum request property.</p>
          </div>

          {/* Box 32 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>32. SERVICE FACILITY LOCATION INFORMATION</label>
            <div className="space-y-2">
              <input
                type="text"
                value={formData.claimInformation?.serviceFacilityLocation?.organizationName || ''}
                onChange={(e) => {
                  if (!formData.claimInformation?.serviceFacilityLocation) {
                    updateField(['claimInformation', 'serviceFacilityLocation'], {});
                  }
                  updateField(['claimInformation', 'serviceFacilityLocation', 'organizationName'], e.target.value);
                }}
                placeholder="Company Name"
                className={`w-full p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
              />
              <input
                type="text"
                value={formData.claimInformation?.serviceFacilityLocation?.address?.address1 || ''}
                onChange={(e) => updateField(['claimInformation', 'serviceFacilityLocation', 'address', 'address1'], e.target.value)}
                placeholder="Street Address"
                className={`w-full p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
              />
              <input
                type="text"
                value={formData.claimInformation?.serviceFacilityLocation?.address?.address2 || ''}
                onChange={(e) => updateField(['claimInformation', 'serviceFacilityLocation', 'address', 'address2'], e.target.value)}
                placeholder="Address Line 2"
                className={`w-full p-2 border rounded ${OPTIONAL_FIELD_CLASS}`}
              />
              <div className="grid grid-cols-3 gap-4">
                <input
                  type="text"
                  value={formData.claimInformation?.serviceFacilityLocation?.address?.city || ''}
                  onChange={(e) => updateField(['claimInformation', 'serviceFacilityLocation', 'address', 'city'], e.target.value)}
                  placeholder="City"
                  className={`p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
                />
                <input
                  type="text"
                  value={formData.claimInformation?.serviceFacilityLocation?.address?.state || ''}
                  onChange={(e) => updateField(['claimInformation', 'serviceFacilityLocation', 'address', 'state'], e.target.value.toUpperCase())}
                  placeholder="State"
                  maxLength={2}
                  className={`p-2 border rounded uppercase ${REQUIRED_FIELD_CLASS}`}
                />
                <input
                  type="text"
                  value={formData.claimInformation?.serviceFacilityLocation?.address?.postalCode || ''}
                  onChange={(e) => updateField(['claimInformation', 'serviceFacilityLocation', 'address', 'postalCode'], e.target.value.replace(/\D/g, '').slice(0, 9))}
                  placeholder="ZIP Code"
                  className={`p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
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
                className={`w-full p-2 border rounded ${REQUIRED_FIELD_CLASS}`}
              />
            </div>
          </div>

          {/* Box 33 */}
          <div className="pb-3">
            <label className={`text-sm font-bold mb-2 block ${REQUIRED_LABEL_CLASS}`}>33. BILLING PROVIDER INFO & PH #</label>
            <div className="space-y-2">
              <input
                type="text"
                value={billingOrganizationForDisplay}
                disabled
                placeholder="Organization Name"
                className={`w-full p-2 border rounded bg-gray-100 cursor-not-allowed ${REQUIRED_FIELD_CLASS}`}
              />
              <input
                type="text"
                value={billingAddressForDisplay.address1}
                disabled
                placeholder="Address"
                className={`w-full p-2 border rounded bg-gray-100 cursor-not-allowed ${REQUIRED_FIELD_CLASS}`}
              />
              <input
                type="text"
                value={billingAddressForDisplay.address2 || ''}
                disabled
                placeholder="Address Line 2"
                className={`w-full p-2 border rounded bg-gray-100 cursor-not-allowed ${OPTIONAL_FIELD_CLASS}`}
              />
              <div className="grid grid-cols-3 gap-4">
                <input
                  type="text"
                  value={billingAddressForDisplay.city}
                  disabled
                  placeholder="City"
                  className={`p-2 border rounded bg-gray-100 cursor-not-allowed ${REQUIRED_FIELD_CLASS}`}
                />
                <input
                  type="text"
                  value={billingAddressForDisplay.state || ''}
                  disabled
                  placeholder="ST"
                  maxLength={2}
                  className={`p-2 border rounded uppercase bg-gray-100 cursor-not-allowed ${REQUIRED_FIELD_CLASS}`}
                />
                <input
                  type="text"
                  value={billingAddressForDisplay.postalCode || ''}
                  disabled
                  placeholder="ZIP"
                  className={`p-2 border rounded bg-gray-100 cursor-not-allowed ${REQUIRED_FIELD_CLASS}`}
                />
              </div>
              <div>
                <label className={`text-xs font-semibold block mb-1 ${REQUIRED_LABEL_CLASS}`}>Billing/submitter contact name</label>
                <input
                  type="text"
                  value={billingContactForDisplay?.name || ''}
                  disabled
                  className={`w-full p-2 border rounded bg-gray-100 cursor-not-allowed ${REQUIRED_FIELD_CLASS}`}
                />
              </div>
              <div>
                <label className={`text-xs font-semibold block mb-1 ${NOT_APPLICABLE_LABEL_CLASS}`}>
                  Box 33 telephone
                </label>
                <input
                  type="tel"
                  value=""
                  disabled
                  placeholder="Not applicable"
                  className={`w-full p-2 border rounded ${NOT_APPLICABLE_FIELD_CLASS}`}
                />
                <p className="mt-1 text-xs text-gray-500">
                  The Optum-required submitter contact phone is configured separately and is not presented as the Box 33 telephone.
                </p>
              </div>
              <input
                type="text"
                value={billingNpiForDisplay}
                disabled
                maxLength={10}
                placeholder="NPI"
                className={`w-full p-2 border rounded bg-gray-100 cursor-not-allowed ${REQUIRED_FIELD_CLASS}`}
              />
              <div>
                <label className={`text-xs font-semibold block mb-1 ${OPTIONAL_LABEL_CLASS}`}>Billing contact email</label>
                <input
                  type="email"
                  value={billingContactForDisplay?.email || ''}
                  disabled
                  className={`w-full p-2 border rounded bg-gray-100 cursor-not-allowed ${OPTIONAL_FIELD_CLASS}`}
                />
              </div>
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
                requestEndpoint={actionType === 'submit'
                  ? '/medicalnetwork/professionalclaims/v3/submission'
                  : '/medicalnetwork/professionalclaims/v3/validation'}
                onGeneratePDF={handleGeneratePDF}
              />
            </div>
          ) : null}
        </div>
      )}

    </fieldset>
  );
}

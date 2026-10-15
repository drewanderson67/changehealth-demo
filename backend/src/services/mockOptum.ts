// Simulated Optum Medical Network responses so the app runs without Optum credentials.
// Shapes follow the Eligibility v3, Professional Claims v3, and PayerList v1 responses the UI renders.

const PLACEHOLDER_PREFIX = 'your_';

function hasValue(value?: string): boolean {
  return !!value && !value.startsWith(PLACEHOLDER_PREFIX);
}

export function isMockMode(): boolean {
  const flag = process.env.OPTUM_MOCK_MODE;
  if (flag) return flag.toLowerCase() === 'true';
  return !hasValue(process.env.OPTUM_SANDBOX_CLIENT_ID) && !hasValue(process.env.OPTUM_PROD_ELIGIBILITY_CLIENT_ID);
}

const delay = () => new Promise(resolve => setTimeout(resolve, 250 + Math.random() * 350));
const traceId = () => `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface MockPayer {
  payerId: string;
  payerPlanName: string;
  additionalPayerIDs: string[];
  phone: string;
}

const MOCK_PAYERS: MockPayer[] = [
  { payerId: 'AETNA', payerPlanName: 'Aetna', additionalPayerIDs: ['60054'], phone: '8008723862' },
  { payerId: 'ANTHM', payerPlanName: 'Anthem Blue Cross Blue Shield', additionalPayerIDs: ['00227'], phone: '8006764445' },
  { payerId: 'BCBSF', payerPlanName: 'Florida Blue', additionalPayerIDs: ['00590'], phone: '8004352583' },
  { payerId: 'CIGNA', payerPlanName: 'Cigna', additionalPayerIDs: ['62308'], phone: '8008842434' },
  { payerId: 'HUMANA', payerPlanName: 'Humana', additionalPayerIDs: ['61101'], phone: '8004574708' },
  { payerId: 'KAISER', payerPlanName: 'Kaiser Permanente', additionalPayerIDs: ['94135'], phone: '8004644000' },
  { payerId: '87726', payerPlanName: 'UnitedHealthcare', additionalPayerIDs: ['UHC'], phone: '8778423210' },
];

function findPayer(id?: string): MockPayer | undefined {
  if (!id) return undefined;
  const upper = id.toUpperCase();
  return MOCK_PAYERS.find(p => p.payerId === upper || p.additionalPayerIDs.includes(upper));
}

function toPayerListRecord(p: MockPayer) {
  return {
    payerPlanName: p.payerPlanName,
    system: 'IMN',
    payerId: p.payerId,
    industryPayerId: p.additionalPayerIDs[0],
    transactionType: 'Eligibility',
    status: 'Active',
    connectionType: 'Direct',
    activationDate: '2020-01-01',
    additionalPayerIDs: p.additionalPayerIDs,
    enrollment: { required: false, notes: null },
    secondaryClaims: true,
    lastUpdated: new Date().toISOString(),
  };
}

function payerListRequest(path: string, params: any) {
  return { url: `mock://medicalnetwork/payerlist/v1/${path}`, method: 'GET', params };
}

export async function mockLookupPayer(params: any) {
  await delay();
  const match = findPayer(params?.payerId);
  return {
    page: 1,
    pageSize: 10,
    total: match ? 1 : 0,
    payers: match ? [toPayerListRecord(match)] : [],
    meta: { applicationMode: 'mock', responseTime: 1 },
    _optumApiRequest: payerListRequest('payers', params),
  };
}

export async function mockGetAllPayers(params: any) {
  await delay();
  return {
    page: 1,
    pageSize: MOCK_PAYERS.length,
    total: MOCK_PAYERS.length,
    payers: MOCK_PAYERS.map(toPayerListRecord),
    meta: { applicationMode: 'mock', responseTime: 1 },
    _optumApiRequest: payerListRequest('payers', params),
  };
}

export async function mockExportPayerList(params: any) {
  await delay();
  const header = 'payerPlanName,system,payerId,industryPayerId,transactionType,status,connectionType,activationDate,additionalPayerIDs';
  const rows = MOCK_PAYERS.map(p => [
    p.payerPlanName, 'IMN', p.payerId, p.additionalPayerIDs[0], 'Eligibility', 'Active', 'Direct', '2020-01-01',
    p.additionalPayerIDs.join(';'),
  ].map(v => `"${v}"`).join(','));
  return { csv: [header, ...rows].join('\n'), _optumApiRequest: payerListRequest('payers/export', params) };
}

function benefit(code: string, name: string, extra: Record<string, any>) {
  return {
    code,
    name,
    coverageLevelCode: 'IND',
    coverageLevel: 'Individual',
    insuranceTypeCode: 'C1',
    insuranceType: 'Commercial',
    ...extra,
  };
}

const IN = { inPlanNetworkIndicatorCode: 'Y', inPlanNetworkIndicator: 'Yes' };
const OUT = { inPlanNetworkIndicatorCode: 'N', inPlanNetworkIndicator: 'No' };
const PLAN = ['30'];
const PLAN_NAME = ['Health Benefit Plan Coverage'];
const ANNUAL = { timeQualifierCode: '25', timeQualifier: 'Contract' };
const REMAINING = { timeQualifierCode: '29', timeQualifier: 'Remaining' };

function activeBenefits(planName: string) {
  const plan = { serviceTypeCodes: PLAN, serviceTypes: PLAN_NAME };
  return [
    benefit('1', 'Active Coverage', { ...plan, ...IN, planCoverage: planName }),
    benefit('1', 'Active Coverage', { serviceTypeCodes: ['1', '33', '47', '48', '50', '86', '88', '98', 'AL', 'MH', 'UC'], ...IN, planCoverage: planName }),
    benefit('C', 'Deductible', { ...plan, ...IN, ...ANNUAL, benefitAmount: '1500' }),
    benefit('C', 'Deductible', { ...plan, ...IN, ...REMAINING, benefitAmount: '875.4' }),
    benefit('C', 'Deductible', { ...plan, ...OUT, ...ANNUAL, benefitAmount: '3000' }),
    benefit('C', 'Deductible', { ...plan, ...OUT, ...REMAINING, benefitAmount: '3000' }),
    benefit('C', 'Deductible', { ...plan, ...IN, ...ANNUAL, coverageLevelCode: 'FAM', coverageLevel: 'Family', benefitAmount: '3000' }),
    benefit('C', 'Deductible', { ...plan, ...IN, ...REMAINING, coverageLevelCode: 'FAM', coverageLevel: 'Family', benefitAmount: '2210.15' }),
    benefit('G', 'Out of Pocket (Stop Loss)', { ...plan, ...IN, ...ANNUAL, benefitAmount: '6000' }),
    benefit('G', 'Out of Pocket (Stop Loss)', { ...plan, ...IN, ...REMAINING, benefitAmount: '4321.9' }),
    benefit('G', 'Out of Pocket (Stop Loss)', { ...plan, ...OUT, ...ANNUAL, benefitAmount: '12000' }),
    benefit('B', 'Co-Payment', { serviceTypeCodes: ['98'], serviceTypes: ['Professional (Physician) Visit - Office'], ...IN, timeQualifierCode: '27', timeQualifier: 'Visit', benefitAmount: '25' }),
    benefit('B', 'Co-Payment', { serviceTypeCodes: ['UC'], serviceTypes: ['Urgent Care'], ...IN, timeQualifierCode: '27', timeQualifier: 'Visit', benefitAmount: '50' }),
    benefit('B', 'Co-Payment', { serviceTypeCodes: ['86'], serviceTypes: ['Emergency Services'], ...IN, timeQualifierCode: '27', timeQualifier: 'Visit', benefitAmount: '250' }),
    benefit('B', 'Co-Payment', { serviceTypeCodes: ['MH'], serviceTypes: ['Mental Health'], ...IN, timeQualifierCode: '27', timeQualifier: 'Visit', benefitAmount: '20', additionalInformation: [{ description: 'Telehealth visits included' }] }),
    benefit('A', 'Co-Insurance', { ...plan, ...IN, benefitPercent: '0.2' }),
    benefit('A', 'Co-Insurance', { ...plan, ...OUT, benefitPercent: '0.4' }),
    benefit('A', 'Co-Insurance', { serviceTypeCodes: ['62'], serviceTypes: ['MRI/CAT Scan'], ...IN, benefitPercent: '0.2', authOrCertIndicator: 'Y', additionalInformation: [{ description: 'Prior authorization required for advanced imaging' }] }),
    benefit('F', 'Limitations', { serviceTypeCodes: ['AL'], serviceTypes: ['Vision (Optometry)'], ...IN, timeQualifierCode: '23', timeQualifier: 'Calendar Year', benefitQuantity: '1', quantityQualifier: 'Visits' }),
    benefit('F', 'Limitations', { serviceTypeCodes: ['33'], serviceTypes: ['Chiropractic'], ...IN, timeQualifierCode: '23', timeQualifier: 'Calendar Year', benefitQuantity: '20', quantityQualifier: 'Visits' }),
  ];
}

const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

export async function mockCheckEligibility(request: any, environment?: string) {
  await delay();
  const subscriberIn = request?.subscriber || {};
  const memberId: string = (subscriberIn.memberId || '').toUpperCase();
  const payer = findPayer(request?.tradingPartnerServiceId);
  const payerName = payer?.payerPlanName || `Payer ${request?.tradingPartnerServiceId || ''}`.trim();
  const year = new Date().getFullYear();
  const base = {
    meta: { applicationMode: 'mock', traceId: traceId(), senderId: 'MOCK', submitterId: 'MOCK', billerId: 'MOCK', outboundTraceId: traceId(), environment: environment || 'production' },
    controlNumber: request?.controlNumber,
    reassociationKey: request?.controlNumber,
    tradingPartnerServiceId: request?.tradingPartnerServiceId,
    provider: {
      providerName: request?.provider?.organizationName,
      entityIdentifier: 'Provider',
      entityType: 'Non-Person Entity',
      npi: request?.provider?.npi,
    },
    payer: {
      entityIdentifier: 'Payer',
      entityType: 'Non-Person Entity',
      name: payerName,
      payorIdentification: request?.tradingPartnerServiceId,
      contactInformation: { contacts: [{ communicationMode: 'Telephone', communicationNumber: payer?.phone || '8005550100' }] },
    },
  };

  if (payer && !memberId) {
    return {
      ...base,
      subscriber: { firstName: subscriberIn.firstName, lastName: subscriberIn.lastName },
      errors: [{ field: 'AAA', code: '72', description: 'Invalid/Missing Subscriber/Insured ID', followupAction: 'Please Correct and Resubmit', location: 'Loop 2100C' }],
    };
  }

  if (!payer || memberId.startsWith('NOTFOUND')) {
    return {
      ...base,
      subscriber: { memberId: subscriberIn.memberId, firstName: subscriberIn.firstName, lastName: subscriberIn.lastName },
      errors: [payer
        ? { field: 'AAA', code: '75', description: 'Subscriber/Insured Not Found', followupAction: 'Please Correct and Resubmit', location: 'Loop 2100C' }
        : { field: 'AAA', code: '42', description: 'Unable to Respond at Current Time (mock payer not recognized)', followupAction: 'Resubmission Allowed', location: 'Loop 2100A' }],
    };
  }

  const terminated = memberId.startsWith('TERM');
  const planName = 'Open Access Plus';
  return {
    ...base,
    subscriber: {
      memberId: subscriberIn.memberId,
      firstName: (subscriberIn.firstName || '').toUpperCase(),
      lastName: (subscriberIn.lastName || '').toUpperCase(),
      gender: subscriberIn.gender,
      dateOfBirth: subscriberIn.dateOfBirth,
      groupNumber: subscriberIn.groupNumber || 'GRP5000',
      entityIdentifier: 'Insured or Subscriber',
      entityType: 'Person',
      relationToSubscriber: 'Self',
      insuredIndicator: 'Y',
      address: { address1: '123 Main St', city: 'Springfield', state: 'IL', postalCode: '62701' },
    },
    planInformation: { groupNumber: subscriberIn.groupNumber || 'GRP5000', groupDescription: 'Mock Employer Group', planNumber: 'OAP-3000' },
    planDateInformation: terminated
      ? { planBegin: `${year - 2}0101`, planEnd: `${year - 1}1231`, eligibilityBegin: `${year - 2}0101` }
      : { planBegin: `${year}0101`, planEnd: `${year}1231`, eligibilityBegin: `${year - 3}0101` },
    planStatus: terminated
      ? [{ statusCode: '6', status: 'Inactive', planDetails: planName, serviceTypeCodes: PLAN }]
      : [{ statusCode: '1', status: 'Active Coverage', planDetails: planName, serviceTypeCodes: ['30', '1', '33', '47', '48', '50', '86', '88', '98', 'AL', 'MH', 'UC'] }],
    benefitsInformation: terminated
      ? [benefit('6', 'Inactive', { serviceTypeCodes: PLAN, serviceTypes: PLAN_NAME, planCoverage: planName })]
      : activeBenefits(planName),
    status: 'Complete',
    transactionSetAcknowledgement: 'Accepted',
    x12: `ISA*00*~ST*271*0001*005010X279A1~BHT*0022*11*${request?.controlNumber || ''}*${yyyymmdd(new Date())}~ (mock)`,
  };
}

function isValidNpi(npi?: string): boolean {
  if (!npi || !/^\d{10}$/.test(npi)) return false;
  const digits = `80840${npi}`.split('').map(Number);
  let sum = 0;
  for (let i = digits.length - 1, alt = false; i >= 0; i--, alt = !alt) {
    let d = digits[i];
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

function claimErrors(claim: any) {
  const errors: Array<{ field: string; value?: string; code: string; description: string; followupAction: string; location?: string }> = [];
  const info = claim?.claimInformation || {};
  const lines: any[] = info.serviceLines || [];
  const add = (field: string, code: string, description: string, value?: string, location?: string) =>
    errors.push({ field, value, code, description, followupAction: 'Please Correct and Resubmit', location });

  if (!isValidNpi(claim?.billing?.npi)) add('billing.npi', '562', 'Billing provider NPI is missing or fails the Luhn check digit', claim?.billing?.npi, 'Loop 2010AA');
  if (claim?.rendering?.npi && !isValidNpi(claim.rendering.npi)) add('rendering.npi', '562', 'Rendering provider NPI fails the Luhn check digit', claim.rendering.npi, 'Loop 2310B');
  if (!claim?.subscriber?.memberId) add('subscriber.memberId', '33', 'Subscriber member ID is required', undefined, 'Loop 2010BA');
  if (!(info.healthCareCodeInformation || []).length) add('claimInformation.healthCareCodeInformation', '255', 'At least one diagnosis code is required', undefined, 'Loop 2300 HI');
  if (!lines.length) add('claimInformation.serviceLines', '21', 'At least one service line is required', undefined, 'Loop 2400');

  lines.forEach((line, i) => {
    const svc = line?.professionalService || {};
    if (!/^[A-Z0-9]{5}$/i.test(svc.procedureCode || '')) add(`serviceLines[${i}].procedureCode`, '454', 'Procedure code must be a 5-character CPT/HCPCS code', svc.procedureCode, 'Loop 2400 SV1');
    if (!(Number(svc.lineItemChargeAmount) > 0)) add(`serviceLines[${i}].lineItemChargeAmount`, '178', 'Line item charge amount must be greater than zero', svc.lineItemChargeAmount, 'Loop 2400 SV1');
  });

  const lineTotal = lines.reduce((sum, l) => sum + Math.round(Number(l?.professionalService?.lineItemChargeAmount || 0) * 100), 0);
  const claimTotal = Math.round(Number(info.claimChargeAmount || 0) * 100);
  if (lines.length && lineTotal !== claimTotal) {
    add('claimInformation.claimChargeAmount', '178', `Claim charge amount (${(claimTotal / 100).toFixed(2)}) must equal the sum of service line charges (${(lineTotal / 100).toFixed(2)})`, info.claimChargeAmount, 'Loop 2300 CLM02');
  }
  return errors;
}

function claimResponse(claim: any, kind: 'validation' | 'submission') {
  const errors = claimErrors(claim);
  const payer = findPayer(claim?.tradingPartnerServiceId);
  const correlationId = traceId();
  const shared = {
    controlNumber: claim?.controlNumber,
    tradingPartnerServiceId: claim?.tradingPartnerServiceId,
    meta: { submitterId: 'MOCK', senderId: 'MOCK', billerId: 'MOCK', traceId: correlationId, applicationMode: 'mock' },
    payer: { payerName: payer?.payerPlanName || claim?.receiver?.organizationName, payerID: claim?.tradingPartnerServiceId },
  };
  if (errors.length) return { ...shared, status: 'ERROR', errors };

  return {
    ...shared,
    status: 'SUCCESS',
    claimReference: {
      correlationId,
      submitterId: 'MOCK',
      customerClaimNumber: claim?.claimInformation?.patientControlNumber,
      patientControlNumber: claim?.claimInformation?.patientControlNumber,
      timeOfResponse: new Date().toISOString(),
      claimType: 'PRO',
      payerID: claim?.tradingPartnerServiceId,
      formatVersion: '5010',
      ...(kind === 'submission' ? { rhClaimNumber: `MOCK${Date.now().toString().slice(-11)}` } : {}),
    },
    editResponses: [],
  };
}

export async function mockValidateClaim(claim: any) {
  await delay();
  return claimResponse(claim, 'validation');
}

export async function mockSubmitClaim(claim: any) {
  await delay();
  return claimResponse(claim, 'submission');
}

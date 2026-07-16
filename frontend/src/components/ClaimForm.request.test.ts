import { describe, expect, it } from 'vitest';
import type { ClaimSubmissionRequest } from '../types/claims';
import {
  buildPrimaryClaimRequest,
  normalizeSavedFormData
} from './ClaimForm';

const buildOptions = {
  environment: 'sandbox' as const,
  submitAsTest: true,
  patientSignatureOnFile: true,
  authorizedSignatureOnFile: true,
  physicianSignatureDate: '2026-07-15'
};

type LegacyDependentDraft = {
  memberId?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  suffix?: string;
  gender: 'M' | 'F' | 'U';
  dateOfBirth: string;
  relationshipToSubscriberCode: '01' | '19' | 'G8';
  address: {
    address1: string;
    city: string;
    state: string;
    postalCode: string;
  };
};

type LegacySavedClaim = ClaimSubmissionRequest & {
  dependent: LegacyDependentDraft;
};

function createValidSandboxClaim(): ClaimSubmissionRequest {
  return {
    controlNumber: '000000001',
    tradingPartnerServiceId: '9496',
    tradingPartnerName: 'EXTRA HEALTHY INSURANCE',
    usageIndicator: 'T',
    submitter: {
      organizationName: 'REGIONAL PPO NETWORK',
      contactInformation: {
        name: 'SUBMITTER CONTACT INFO',
        phoneNumber: '123456789',
        email: 'email@email.com'
      }
    },
    receiver: {
      organizationName: 'EXTRA HEALTHY INSURANCE'
    },
    subscriber: {
      paymentResponsibilityLevelCode: 'P',
      memberId: '0000000001',
      firstName: 'johnone',
      lastName: 'doeOne',
      gender: 'M',
      dateOfBirth: '19800102',
      policyNumber: '00001',
      groupNumber: '0000000001',
      address: {
        address1: '123 address1',
        city: 'city1',
        state: 'wa',
        postalCode: '981010000'
      },
      contactInformation: {
        name: 'johnone doeOne',
        phoneNumber: '0000000001'
      }
    },
    billing: {
      providerType: 'BillingProvider',
      organizationName: 'HAPPY DOCTORS GROUPPRACTICE',
      npi: '1760854442',
      employerId: '123456789',
      address: {
        address1: '000 address1',
        address2: 'apt 000',
        city: 'city2',
        state: 'tn',
        postalCode: '372030000'
      },
      contactInformation: {
        name: 'janetwo doetwo',
        phoneNumber: '0000000001',
        email: 'email@email.com'
      }
    },
    claimInformation: {
      claimFilingCode: 'CI',
      patientControlNumber: '12345',
      claimChargeAmount: '200.00',
      placeOfServiceCode: '10',
      claimFrequencyCode: '1',
      signatureIndicator: 'Y',
      planParticipationCode: 'A',
      benefitsAssignmentCertificationIndicator: 'Y',
      releaseInformationCode: 'Y',
      healthCareCodeInformation: [
        { diagnosisTypeCode: 'ABK', diagnosisCode: 'Z00.00' },
        { diagnosisTypeCode: 'ABF', diagnosisCode: 'Z13.31' },
        { diagnosisTypeCode: 'ABF', diagnosisCode: 'Z13.39' },
        { diagnosisTypeCode: 'ABF', diagnosisCode: 'Z13.220' },
        { diagnosisTypeCode: 'ABF', diagnosisCode: 'Z13.1' }
      ],
      serviceLines: [
        {
          serviceDate: '20260715',
          professionalService: {
            procedureIdentifier: 'HC',
            procedureCode: '99386',
            procedureModifiers: ['95'],
            lineItemChargeAmount: '20000',
            measurementUnit: 'UN',
            serviceUnitCount: '1',
            placeOfServiceCode: '10',
            compositeDiagnosisCodePointers: {
              diagnosisCodePointers: ['1']
            }
          }
        }
      ],
      serviceFacilityLocation: {
        organizationName: 'HAPPY DOCTORS GROUP',
        npi: '1760854442',
        address: {
          address1: '000 address1',
          city: 'city2',
          state: 'tn',
          postalCode: '372030000'
        }
      }
    }
  };
}

function createLegacyDependent(
  memberId = 'DEPENDENT-PATIENT-ID',
  relationshipToSubscriberCode: LegacyDependentDraft['relationshipToSubscriberCode'] = '01'
): LegacyDependentDraft {
  return {
    firstName: 'janeone',
    lastName: 'doeOne',
    gender: 'F',
    dateOfBirth: '19850505',
    relationshipToSubscriberCode,
    memberId,
    address: {
      address1: '456 patient address',
      city: 'patientcity',
      state: 'or',
      postalCode: '972020000'
    }
  };
}

function withLegacyDependent(
  claim: ClaimSubmissionRequest,
  dependent: LegacyDependentDraft
): LegacySavedClaim {
  return { ...claim, dependent };
}

function expectSubscriberOnlyMemberId(
  claim: Partial<ClaimSubmissionRequest>,
  expectedMemberId: string
) {
  expect(claim.subscriber?.memberId).toBe(expectedMemberId);
  expect(claim).not.toHaveProperty('dependent');
  expect((JSON.stringify(claim).match(/"memberId"/g) || [])).toHaveLength(1);
}

describe('buildPrimaryClaimRequest', () => {
  it('treats Box 24F as the line total when calculating Box 28', () => {
    const formData = createValidSandboxClaim();
    formData.claimInformation.serviceLines[0].professionalService.serviceUnitCount = '3';

    const request = buildPrimaryClaimRequest(formData, buildOptions);

    expect(request.claimInformation.serviceLines[0].professionalService.lineItemChargeAmount).toBe('200.00');
    expect(request.claimInformation.claimChargeAmount).toBe('200.00');
  });

  it('always serializes the sole patient member ID on subscriber', () => {
    const request = buildPrimaryClaimRequest(createValidSandboxClaim(), buildOptions);

    expectSubscriberOnlyMemberId(request, '0000000001');
  });

  it('never forwards a legacy dependent property', () => {
    const legacyFormData = withLegacyDependent(
      createValidSandboxClaim(),
      createLegacyDependent()
    );

    const request = buildPrimaryClaimRequest(legacyFormData, buildOptions);

    expectSubscriberOnlyMemberId(request, '0000000001');
  });

  it('requires the patient member ID on subscriber', () => {
    const formData = createValidSandboxClaim();
    formData.subscriber.memberId = '   ';

    expect(() => buildPrimaryClaimRequest(formData, buildOptions)).toThrow('Box 1a - Patient member ID');
  });

  it('normalizes address states for Optum canned sandbox requests', () => {
    const formData = createValidSandboxClaim();
    formData.subscriber.address!.state = 'WA';
    formData.billing.address!.state = 'TN';
    formData.claimInformation.serviceFacilityLocation!.address.state = 'TN';

    const request = buildPrimaryClaimRequest(formData, buildOptions);

    expect(request.subscriber.address?.state).toBe('wa');
    expect(request.billing.address?.state).toBe('tn');
    expect(request.claimInformation.serviceFacilityLocation?.address.state).toBe('tn');
    expect(request).not.toHaveProperty('dependent');
  });

  it('keeps standard uppercase address states in production requests', () => {
    const formData = createValidSandboxClaim();
    formData.subscriber.address!.state = 'wa';
    formData.claimInformation.serviceFacilityLocation!.address.state = 'or';
    formData.claimInformation.patientControlNumber = 'RC-123456789012';
    formData.claimInformation.serviceLines[0].renderingProvider = {
      providerType: 'RenderingProvider',
      firstName: 'Test',
      lastName: 'Provider',
      npi: '1760854442'
    };

    const request = buildPrimaryClaimRequest(formData, {
      ...buildOptions,
      environment: 'production'
    });

    expect(request.subscriber.address?.state).toBe('WA');
    expect(request.claimInformation.serviceFacilityLocation?.address.state).toBe('OR');
    expect(request.billing.address?.state).toBe('OR');
    expect(request).not.toHaveProperty('dependent');
  });
});

describe('normalizeSavedFormData', () => {
  it('promotes a legacy production dependent patient into subscriber', () => {
    const saved = createValidSandboxClaim();
    saved.tradingPartnerServiceId = '87726';
    saved.claimInformation.patientControlNumber = 'RC-123456789012';
    const legacySaved = withLegacyDependent(saved, createLegacyDependent());

    const normalized = normalizeSavedFormData(legacySaved);

    expectSubscriberOnlyMemberId(normalized, 'DEPENDENT-PATIENT-ID');
    expect(normalized.subscriber).toMatchObject({
      firstName: 'janeone',
      lastName: 'doeOne',
      dateOfBirth: '19850505',
      groupNumber: '0000000001',
      policyNumber: '00001',
      address: {
        address1: '456 patient address',
        city: 'patientcity',
        state: 'or'
      }
    });
  });

  it('recovers a sole member ID stored on the old subscriber root', () => {
    const saved = createValidSandboxClaim();
    saved.tradingPartnerServiceId = '87726';
    saved.claimInformation.patientControlNumber = 'RC-123456789012';
    const legacySaved = withLegacyDependent(saved, createLegacyDependent('   ', '19'));

    const normalized = normalizeSavedFormData(legacySaved);

    expectSubscriberOnlyMemberId(normalized, '0000000001');
    expect(normalized.subscriber?.firstName).toBe('janeone');
  });

  it('resets an old canned spouse draft to Optum\'s supported subscriber fixture', () => {
    const legacySaved = withLegacyDependent(
      createValidSandboxClaim(),
      createLegacyDependent('0000000002')
    );

    const normalized = normalizeSavedFormData(legacySaved);

    expectSubscriberOnlyMemberId(normalized, '0000000001');
    expect(normalized.subscriber).toMatchObject({
      firstName: 'johnone',
      lastName: 'doeOne',
      address: { state: 'wa' }
    });
  });
});

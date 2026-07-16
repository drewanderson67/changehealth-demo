import { describe, expect, it } from 'vitest';
import type { ClaimSubmissionRequest, Dependent } from '../types/claims';
import {
  applyPatientRelationship,
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

function createDependent(
  relationshipToSubscriberCode: Dependent['relationshipToSubscriberCode'] = '01',
  memberId = 'DEPENDENT-PATIENT-ID'
): Dependent {
  return {
    firstName: 'janethree',
    lastName: 'doethree',
    gender: 'F',
    dateOfBirth: '19850505',
    relationshipToSubscriberCode,
    memberId,
    address: {
      address1: '123 address1',
      city: 'city1',
      state: 'wa',
      postalCode: '981010000'
    }
  };
}

function expectOnlyPatientMemberId(
  claim: Pick<Partial<ClaimSubmissionRequest>, 'subscriber' | 'dependent'>,
  expectedRoot: 'subscriber' | 'dependent',
  expectedMemberId: string
) {
  expect(claim.subscriber?.memberId).toBe(
    expectedRoot === 'subscriber' ? expectedMemberId : undefined
  );
  expect(claim.dependent?.memberId).toBe(
    expectedRoot === 'dependent' ? expectedMemberId : undefined
  );
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

  it('serializes the sole patient member ID on the subscriber for Self', () => {
    const formData = createValidSandboxClaim();

    const request = buildPrimaryClaimRequest(formData, buildOptions);

    expectOnlyPatientMemberId(request, 'subscriber', '0000000001');
  });

  it.each(['01', '19', 'G8'] as const)(
    'serializes the sole patient member ID on the dependent for relationship %s',
    (relationship) => {
      const formData = createValidSandboxClaim();
      formData.subscriber.memberId = 'LEGACY-WRONG-ROOT-ID';
      formData.dependent = createDependent(relationship, 'DEPENDENT-PATIENT-ID');

      const request = buildPrimaryClaimRequest(formData, buildOptions);

      expectOnlyPatientMemberId(request, 'dependent', 'DEPENDENT-PATIENT-ID');
    }
  );

  it('recovers a legacy subscriber-root ID when the dependent ID is blank', () => {
    const formData = createValidSandboxClaim();
    formData.dependent = createDependent('01', '   ');

    const request = buildPrimaryClaimRequest(formData, buildOptions);

    expectOnlyPatientMemberId(request, 'dependent', '0000000001');
  });

  it('normalizes address states for Optum canned sandbox requests', () => {
    const formData = createValidSandboxClaim();
    formData.subscriber.address!.state = 'WA';
    formData.dependent = createDependent();
    formData.dependent.address!.state = 'WA';
    formData.billing.address!.state = 'TN';
    formData.claimInformation.serviceFacilityLocation!.address.state = 'TN';

    const request = buildPrimaryClaimRequest(formData, buildOptions);

    expect(request.subscriber.address?.state).toBe('wa');
    expect(request.dependent?.address?.state).toBe('wa');
    expect(request.billing.address?.state).toBe('tn');
    expect(request.claimInformation.serviceFacilityLocation?.address.state).toBe('tn');
  });

  it('keeps standard uppercase address states in production requests', () => {
    const formData = createValidSandboxClaim();
    formData.subscriber.address!.state = 'wa';
    formData.dependent = createDependent();
    formData.dependent.address!.state = 'wa';
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
    expect(request.dependent?.address?.state).toBe('WA');
    expect(request.claimInformation.serviceFacilityLocation?.address.state).toBe('OR');
    expect(request.billing.address?.state).toBe('OR');
  });
});

describe('applyPatientRelationship', () => {
  it('loads the Optum canned spouse and puts the sole ID on Jane', () => {
    const formData = createValidSandboxClaim();

    const spouseClaim = applyPatientRelationship(formData, '01', 'sandbox');

    expectOnlyPatientMemberId(spouseClaim, 'dependent', '0000000002');
    expect(spouseClaim.subscriber?.firstName).toBe('johnone');
    expect(spouseClaim.subscriber?.address?.state).toBe('wa');
    expect(spouseClaim.dependent).toMatchObject({
      firstName: 'janeone',
      lastName: 'doeOne',
      gender: 'F',
      dateOfBirth: '19800102',
      relationshipToSubscriberCode: '01',
      address: { state: 'wa' }
    });
  });

  it.each(['01', '19', 'G8'] as const)(
    'moves the sole patient ID to the production dependent for relationship %s',
    (relationship) => {
      const formData = createValidSandboxClaim();

      const dependentClaim = applyPatientRelationship(formData, relationship, 'production');

      expectOnlyPatientMemberId(dependentClaim, 'dependent', '0000000001');
      expect(dependentClaim.dependent?.firstName).toBe('johnone');
      expect(dependentClaim.subscriber?.firstName).toBeUndefined();
      expect(dependentClaim.dependent?.relationshipToSubscriberCode).toBe(relationship);
    }
  );

  it('moves the patient ID back to subscriber when returning to Self', () => {
    const dependentClaim = applyPatientRelationship(
      createValidSandboxClaim(),
      '01',
      'production'
    );

    const selfClaim = applyPatientRelationship(dependentClaim, '18', 'production');

    expectOnlyPatientMemberId(selfClaim, 'subscriber', '0000000001');
    expect(selfClaim.dependent).toBeUndefined();
    expect(selfClaim.subscriber?.firstName).toBe('johnone');
  });

  it('preserves the patient ID when changing between dependent relationships', () => {
    const spouseClaim = applyPatientRelationship(
      createValidSandboxClaim(),
      '01',
      'production'
    );

    const otherClaim = applyPatientRelationship(spouseClaim, 'G8', 'production');

    expectOnlyPatientMemberId(otherClaim, 'dependent', '0000000001');
    expect(otherClaim.dependent?.relationshipToSubscriberCode).toBe('G8');
  });
});

describe('normalizeSavedFormData', () => {
  it('moves a legacy subscriber-root ID to the dependent patient', () => {
    const saved = createValidSandboxClaim();
    saved.tradingPartnerServiceId = '87726';
    saved.claimInformation.patientControlNumber = 'RC-123456789012';
    saved.dependent = createDependent('01', '   ');

    const normalized = normalizeSavedFormData(saved);

    expectOnlyPatientMemberId(normalized, 'dependent', '0000000001');
  });

  it('prefers the dependent patient ID when an old draft contains both', () => {
    const saved = createValidSandboxClaim();
    saved.tradingPartnerServiceId = '87726';
    saved.claimInformation.patientControlNumber = 'RC-123456789012';
    saved.dependent = createDependent('19', 'DEPENDENT-PATIENT-ID');

    const normalized = normalizeSavedFormData(saved);

    expectOnlyPatientMemberId(normalized, 'dependent', 'DEPENDENT-PATIENT-ID');
  });

  it('upgrades an old canned spouse draft to Jane\'s sandbox member ID', () => {
    const saved = createValidSandboxClaim();
    saved.dependent = createDependent('01', '');

    const normalized = normalizeSavedFormData(saved);

    expectOnlyPatientMemberId(normalized, 'dependent', '0000000002');
  });
});

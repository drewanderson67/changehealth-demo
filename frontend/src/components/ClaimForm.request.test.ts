import { describe, expect, it } from 'vitest';
import type { ClaimSubmissionRequest, Dependent } from '../types/claims';
import { applyPatientRelationship, buildPrimaryClaimRequest } from './ClaimForm';

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

function createDependent(): Dependent {
  return {
    firstName: 'janethree',
    lastName: 'doethree',
    gender: 'F',
    dateOfBirth: '19850505',
    relationshipToSubscriberCode: '01',
    memberId: 'LEGACY-DEPENDENT-ID',
    address: {
      address1: '123 address1',
      city: 'city1',
      state: 'wa',
      postalCode: '981010000'
    }
  };
}

describe('buildPrimaryClaimRequest', () => {
  it('treats Box 24F as the line total when calculating Box 28', () => {
    const formData = createValidSandboxClaim();
    formData.claimInformation.serviceLines[0].professionalService.serviceUnitCount = '3';

    const request = buildPrimaryClaimRequest(formData, buildOptions);

    expect(request.claimInformation.serviceLines[0].professionalService.lineItemChargeAmount).toBe('200.00');
    expect(request.claimInformation.claimChargeAmount).toBe('200.00');
  });

  it('keeps Box 1a on the subscriber for a dependent patient', () => {
    const formData = createValidSandboxClaim();
    formData.subscriber.memberId = 'SUBSCRIBER-BOX-1A';
    formData.dependent = createDependent();

    const request = buildPrimaryClaimRequest(formData, buildOptions);

    expect(request.subscriber.memberId).toBe('SUBSCRIBER-BOX-1A');
    expect(request.dependent?.memberId).toBeUndefined();
    expect(JSON.stringify(request.dependent)).not.toContain('"memberId"');
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
  it('loads the Optum canned spouse while preserving the canned subscriber', () => {
    const formData = createValidSandboxClaim();

    const spouseClaim = applyPatientRelationship(formData, '01', 'sandbox');

    expect(spouseClaim.subscriber?.memberId).toBe('0000000001');
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
    expect(spouseClaim.dependent?.memberId).toBeUndefined();
  });

  it('does not inject the canned spouse into production relationship changes', () => {
    const formData = createValidSandboxClaim();

    const spouseClaim = applyPatientRelationship(formData, '01', 'production');

    expect(spouseClaim.dependent?.firstName).toBe('johnone');
    expect(spouseClaim.subscriber?.firstName).toBeUndefined();
    expect(spouseClaim.subscriber?.memberId).toBe('0000000001');
  });
});

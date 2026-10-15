export type Environment = 'sandbox' | 'production';

export interface EligibilityRequest {
  controlNumber: string;
  tradingPartnerServiceId: string;
  provider?: {
    organizationName?: string;
    npi?: string;
  };
  subscriber: {
    memberId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: 'M' | 'F';
    groupNumber?: string;
    ssn?: string;
  };
}

export interface X12AdditionalInfo {
  description?: string;
  codeListQualifierCode?: string;
  industryCode?: string;
}

export interface X12Address {
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

export interface X12Contact {
  name?: string;
  communicationMode?: string;
  communicationNumber?: string;
}

export interface X12Entity {
  entityIdentifier?: string;
  entityType?: string;
  entityName?: string;
  entityFirstname?: string;
  entityIdentificationValue?: string;
  address?: X12Address;
  contactInformation?: { contacts?: X12Contact[] };
}

export interface EligibilityPerson {
  memberId?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  dateOfBirth?: string;
  groupNumber?: string;
  entityIdentifier?: string;
  entityType?: string;
  relationToSubscriber?: string;
  insuredIndicator?: string;
  maintenanceTypeCode?: string;
  maintenanceReasonCode?: string;
  address?: X12Address;
}

export interface EligibilityProvider {
  providerName?: string;
  organizationName?: string;
  npi?: string;
  entityIdentifier?: string;
  entityType?: string;
  address?: X12Address;
}

export interface EligibilityPayer {
  name?: string;
  entityIdentifier?: string;
  entityType?: string;
  payorIdentification?: string;
  contactInformation?: { contacts?: X12Contact[] };
}

export interface BenefitInformation {
  code?: string;
  name?: string;
  coverageLevel?: string;
  coverageLevelCode?: string;
  serviceTypeCodes?: string[];
  serviceTypes?: string[];
  insuranceType?: string;
  insuranceTypeCode?: string;
  planCoverage?: string;
  inPlanNetworkIndicator?: string;
  inPlanNetworkIndicatorCode?: string;
  timeQualifier?: string;
  timeQualifierCode?: string;
  benefitAmount?: string;
  benefitPercent?: string;
  authOrCertIndicator?: string;
  headerLoopIdentifierCode?: string;
  trailerLoopIdentifierCode?: string;
  additionalInformation?: X12AdditionalInfo[];
  eligibilityAdditionalInformation?: X12AdditionalInfo;
  eligibilityAdditionalInformationList?: X12AdditionalInfo[];
  benefitsRelatedEntities?: X12Entity[];
  benefitsRelatedEntity?: X12Entity;
}

export interface EligibilityError {
  field?: string;
  code?: string;
  description?: string;
  followupAction?: string;
  location?: string;
  message?: string;
}

export interface EligibilityResponse {
  meta?: { applicationMode?: string; traceId?: string; senderId?: string; submitterId?: string; billerId?: string; outboundTraceId?: string; environment?: string };
  controlNumber?: string;
  reassociationKey?: string;
  tradingPartnerServiceId?: string;
  provider?: EligibilityProvider;
  subscriber?: EligibilityPerson;
  subscriberTraceNumbers?: { traceType?: string; traceTypeCode?: string; referenceIdentification?: string; originatingCompanyIdentifier?: string }[];
  dependents?: EligibilityPerson[];
  payer?: EligibilityPayer;
  planInformation?: { groupNumber?: string; groupDescription?: string; planNumber?: string };
  planDateInformation?: { planBegin?: string; planEnd?: string; eligibilityBegin?: string; eligibility?: string };
  planStatus?: { statusCode?: string; status?: string; planDetails?: string; serviceTypeCodes?: string[] }[];
  benefitsInformation?: BenefitInformation[];
  errors?: EligibilityError[];
  status?: string;
  transactionSetAcknowledgement?: string;
  implementationTransactionSetSyntaxError?: string;
  x12?: string;
}


import React from 'react';
import type { BenefitInformation, EligibilityResponse, X12Address, X12AdditionalInfo, X12Contact, X12Entity } from '../types/eligibility';

type PeriodBenefits = { annual?: BenefitInformation; remaining?: BenefitInformation };

interface Props {
  response: EligibilityResponse;
}

// Service type code to name mapping
const SERVICE_TYPE_NAMES: Record<string, string> = {
  '1': 'Medical Care',
  '30': 'Health Benefit Plan Coverage',
  '33': 'Chiropractic',
  '35': 'Dental Care',
  '48': 'Hospital - Inpatient',
  '50': 'Hospital - Outpatient',
  '86': 'Emergency Services',
  '88': 'Pharmacy',
  '96': 'Professional (Physician)',
  '98': 'Professional (Physician) Visit - Office',
  'PT': 'Physical Therapy',
  'MH': 'Mental Health',
  'AL': 'Vision (Optometry)',
  'UC': 'Urgent Care',
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr || dateStr.length !== 8) return dateStr ?? '';
  return `${dateStr.substring(4, 6)}/${dateStr.substring(6, 8)}/${dateStr.substring(0, 4)}`;
};

const formatCurrency = (amount: string | number): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return amount.toString();
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPercent = (percent: string | number): string => {
  const num = typeof percent === 'string' ? parseFloat(percent) : percent;
  if (isNaN(num)) return percent.toString();
  return `${(num * 100).toFixed(0)}%`;
};

// Helper to organize deductibles/OOP by service, level, and network
function organizeFinancialBenefits(benefits: BenefitInformation[]) {
  const organized: Record<string, Record<string, { inNetwork?: PeriodBenefits; outNetwork?: PeriodBenefits }>> = {};
  
  benefits.forEach((benefit) => {
    // Create a consistent service key - sort codes for grouping similar services
    const serviceCodes = benefit.serviceTypeCodes || [];
    const serviceKey = serviceCodes.length > 0 
      ? serviceCodes.sort().join(',') 
      : 'All Services';
    const level = benefit.coverageLevel || 'Individual';
    const network = benefit.inPlanNetworkIndicatorCode === 'Y' ? 'inNetwork' : 'outNetwork';
    
    if (!organized[serviceKey]) {
      organized[serviceKey] = {};
    }
    if (!organized[serviceKey][level]) {
      organized[serviceKey][level] = {};
    }
    
    // Store both annual and remaining if available
    const period = benefit.timeQualifier === 'Contract' || benefit.timeQualifier === '25' ? 'annual' : 'remaining';
    if (!organized[serviceKey][level][network]) {
      organized[serviceKey][level][network] = {};
    }
    // If we already have this period, prefer the one with additionalInformation (more details)
    if (!organized[serviceKey][level][network][period] || benefit.additionalInformation) {
      organized[serviceKey][level][network][period] = benefit;
    }
  });
  
  return organized;
}

// Helper to organize copays/coinsurance by service and network
function organizeCostSharing(benefits: BenefitInformation[]) {
  const organized: Record<string, { inNetwork?: BenefitInformation[]; outNetwork?: BenefitInformation[] }> = {};
  
  benefits.forEach((benefit) => {
    // Create a consistent service key - sort codes for grouping similar services
    const serviceCodes = benefit.serviceTypeCodes || [];
    const serviceKey = serviceCodes.length > 0 
      ? serviceCodes.sort().join(',') 
      : 'All Services';
    const network = benefit.inPlanNetworkIndicatorCode === 'Y' ? 'inNetwork' : 'outNetwork';
    
    if (!organized[serviceKey]) {
      organized[serviceKey] = {};
    }
    if (!organized[serviceKey][network]) {
      organized[serviceKey][network] = [];
    }
    organized[serviceKey][network].push(benefit);
  });
  
  return organized;
}

// Helper component to display key-value pairs
const KeyValueDisplay = ({ label, value, className = '' }: { label: string; value: unknown; className?: string }) => {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className={`text-sm ${className}`}>
      <span className="font-medium text-gray-700">{label}:</span>{' '}
      <span className="text-gray-900">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
    </div>
  );
};

// Helper to render address
const renderAddress = (address?: X12Address) => {
  if (!address) return null;
  const parts = [
    address.address1,
    address.address2,
    address.city,
    address.state,
    address.postalCode
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
};

// Helper to render contact information
const renderContactInfo = (contacts?: X12Contact[]) => {
  if (!contacts || contacts.length === 0) return null;
  return contacts.map((contact, idx) => (
    <div key={idx} className="text-xs text-gray-600">
      {contact.communicationMode && <span className="font-medium">{contact.communicationMode}:</span>}{' '}
      {contact.communicationNumber}
    </div>
  ));
};

export default function EligibilityDetails({ response }: Props) {
  const meta = response.meta || {};
  const subscriber = response.subscriber || {};
  const payer = response.payer || {};
  const provider = response.provider || {};
  const planInfo = response.planInformation || {};
  const planDateInfo = response.planDateInformation || {};
  const planStatus = response.planStatus || [];
  const benefits = response.benefitsInformation || [];
  const subscriberTraceNumbers = response.subscriberTraceNumbers || [];
  const dependents = response.dependents || [];

  // Group benefits by type
  const allActiveCoverage = benefits.filter(b => b.code === '1');
  
  // Deduplicate active coverage entries
  const activeCoverageMap = new Map<string, BenefitInformation>();
  allActiveCoverage.forEach((coverage) => {
    const serviceKey = JSON.stringify({
      services: (coverage.serviceTypeCodes || []).sort(),
      network: coverage.inPlanNetworkIndicatorCode || 'unknown'
    });
    const existing = activeCoverageMap.get(serviceKey);
    
    if (!existing || (coverage.planCoverage && !existing.planCoverage)) {
      activeCoverageMap.set(serviceKey, coverage);
    }
  });
  const activeCoverage = Array.from(activeCoverageMap.values());
  
  const copays = benefits.filter(b => b.code === 'B');
  const coinsurance = benefits.filter(b => b.code === 'A');
  const deductibles = benefits.filter(b => b.code === 'C');
  const oopMax = benefits.filter(b => b.code === 'G');
  const limitations = benefits.filter(b => b.code === 'F');
  const primaryCareProvider = benefits.filter(b => b.code === 'L');
  const secondaryPayors = benefits.filter(b => b.code === 'R');

  // Organize financial benefits
  const organizedDeductibles = organizeFinancialBenefits(deductibles);
  const organizedOOPMax = organizeFinancialBenefits(oopMax);
  const organizedCopays = organizeCostSharing(copays);
  const organizedCoinsurance = organizeCostSharing(coinsurance);

  return (
    <div className="space-y-4">
      {/* Transaction Information */}
      {(meta.senderId || meta.traceId || response.controlNumber || response.reassociationKey) && (
        <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Transaction Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            {meta.traceId && <KeyValueDisplay label="Trace ID" value={meta.traceId} />}
            {response.controlNumber && <KeyValueDisplay label="Control Number" value={response.controlNumber} />}
            {response.reassociationKey && <KeyValueDisplay label="Reassociation Key" value={response.reassociationKey} />}
            {meta.senderId && <KeyValueDisplay label="Sender ID" value={meta.senderId} />}
            {meta.submitterId && <KeyValueDisplay label="Submitter ID" value={meta.submitterId} />}
            {meta.billerId && <KeyValueDisplay label="Biller ID" value={meta.billerId} />}
            {meta.applicationMode && <KeyValueDisplay label="Application Mode" value={meta.applicationMode} />}
            {response.tradingPartnerServiceId && <KeyValueDisplay label="Trading Partner Service ID" value={response.tradingPartnerServiceId} />}
          </div>
        </div>
      )}

      {/* Provider Information */}
      {provider && Object.keys(provider).length > 0 && (
        <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Provider Information</h2>
          <div className="space-y-2 text-sm">
            {provider.providerName && <KeyValueDisplay label="Provider Name" value={provider.providerName} />}
            {provider.organizationName && <KeyValueDisplay label="Organization Name" value={provider.organizationName} />}
            {provider.npi && <KeyValueDisplay label="NPI" value={provider.npi} />}
            {provider.entityIdentifier && <KeyValueDisplay label="Entity Identifier" value={provider.entityIdentifier} />}
            {provider.entityType && <KeyValueDisplay label="Entity Type" value={provider.entityType} />}
            {provider.address && renderAddress(provider.address) && (
              <div className="text-sm">
                <span className="font-medium text-gray-700">Address:</span>{' '}
                <span className="text-gray-900">{renderAddress(provider.address)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Patient & Insurance Summary Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-xs font-semibold text-gray-600 uppercase mb-2">Patient Information</h3>
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-gray-900">{subscriber.firstName} {subscriber.lastName}</p>
              <p className="text-gray-700">Member ID: <span className="font-mono">{subscriber.memberId || 'N/A'}</span></p>
              <p className="text-gray-700">DOB: {formatDate(subscriber.dateOfBirth) || 'N/A'} • {subscriber.gender === 'M' ? 'Male' : subscriber.gender === 'F' ? 'Female' : subscriber.gender || 'N/A'}</p>
              {subscriber.groupNumber && (
                <p className="text-gray-700">Group: <span className="font-mono">{subscriber.groupNumber}</span></p>
              )}
              {subscriber.entityIdentifier && (
                <p className="text-gray-700">Entity Identifier: {subscriber.entityIdentifier}</p>
              )}
              {subscriber.entityType && (
                <p className="text-gray-700">Entity Type: {subscriber.entityType}</p>
              )}
              {subscriber.relationToSubscriber && (
                <p className="text-gray-700">Relation: {subscriber.relationToSubscriber}</p>
              )}
              {subscriber.insuredIndicator && (
                <p className="text-gray-700">Insured Indicator: {subscriber.insuredIndicator}</p>
              )}
              {subscriber.maintenanceTypeCode && (
                <p className="text-gray-700">Maintenance Type: {subscriber.maintenanceTypeCode}</p>
              )}
              {subscriber.maintenanceReasonCode && (
                <p className="text-gray-700">Maintenance Reason: {subscriber.maintenanceReasonCode}</p>
              )}
              {subscriber.address && renderAddress(subscriber.address) && (
                <p className="text-gray-700">Address: {renderAddress(subscriber.address)}</p>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-600 uppercase mb-2">Insurance Information</h3>
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-gray-900">{payer.name || 'N/A'}</p>
              <p className="text-gray-700">Payer ID: <span className="font-mono">{payer.payorIdentification || response.tradingPartnerServiceId || 'N/A'}</span></p>
              {payer.entityIdentifier && (
                <p className="text-gray-700">Entity Identifier: {payer.entityIdentifier}</p>
              )}
              {payer.entityType && (
                <p className="text-gray-700">Entity Type: {payer.entityType}</p>
              )}
              {planInfo.groupNumber && (
                <p className="text-gray-700">Plan Group: <span className="font-mono">{planInfo.groupNumber}</span></p>
              )}
              {planDateInfo.planBegin && (
                <p className="text-gray-700">Plan Start: {formatDate(planDateInfo.planBegin)}</p>
              )}
              {planDateInfo.planEnd && (
                <p className="text-gray-700">Plan End: {formatDate(planDateInfo.planEnd)}</p>
              )}
              {payer.contactInformation?.contacts && payer.contactInformation.contacts.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-gray-700">Contact:</p>
                  {renderContactInfo(payer.contactInformation.contacts)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Subscriber Trace Numbers */}
      {subscriberTraceNumbers.length > 0 && (
        <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Subscriber Trace Numbers</h2>
          <div className="space-y-2">
            {subscriberTraceNumbers.map((trace, idx) => (
              <div key={idx} className="p-3 bg-gray-50 rounded border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {trace.traceType && <KeyValueDisplay label="Trace Type" value={trace.traceType} />}
                  {trace.traceTypeCode && <KeyValueDisplay label="Trace Type Code" value={trace.traceTypeCode} />}
                  {trace.referenceIdentification && <KeyValueDisplay label="Reference ID" value={trace.referenceIdentification} />}
                  {trace.originatingCompanyIdentifier && <KeyValueDisplay label="Originating Company ID" value={trace.originatingCompanyIdentifier} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dependents */}
      {dependents.length > 0 && (
        <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Dependents</h2>
          <div className="space-y-3">
            {dependents.map((dependent, idx: number) => (
              <div key={idx} className="p-3 bg-purple-50 rounded border border-purple-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {dependent.firstName && dependent.lastName && (
                    <p className="font-semibold text-gray-900">{dependent.firstName} {dependent.lastName}</p>
                  )}
                  {dependent.memberId && <KeyValueDisplay label="Member ID" value={dependent.memberId} />}
                  {dependent.dateOfBirth && <KeyValueDisplay label="DOB" value={formatDate(dependent.dateOfBirth)} />}
                  {dependent.gender && <KeyValueDisplay label="Gender" value={dependent.gender === 'M' ? 'Male' : dependent.gender === 'F' ? 'Female' : dependent.gender} />}
                  {dependent.relationToSubscriber && <KeyValueDisplay label="Relation" value={dependent.relationToSubscriber} />}
                  {dependent.entityIdentifier && <KeyValueDisplay label="Entity Identifier" value={dependent.entityIdentifier} />}
                  {dependent.entityType && <KeyValueDisplay label="Entity Type" value={dependent.entityType} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan Status */}
      {planStatus.length > 0 && (
        <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Plan Status</h2>
          <div className="space-y-2">
            {planStatus.map((status, idx) => (
              <div key={idx} className="p-3 bg-green-50 rounded border border-green-200">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    {status.status && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                        {status.status}
                      </span>
                    )}
                    {status.statusCode && (
                      <span className="ml-2 text-xs text-gray-600">Code: {status.statusCode}</span>
                    )}
                  </div>
                </div>
                {status.planDetails && (
                  <p className="text-sm font-semibold text-gray-900 mt-1">{status.planDetails}</p>
                )}
                {status.serviceTypeCodes && status.serviceTypeCodes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {status.serviceTypeCodes.map((code: string) => (
                      <span 
                        key={code}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {SERVICE_TYPE_NAMES[code] || code}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coverage Status */}
      {activeCoverage.length > 0 && (
        <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Coverage Status</h2>
          <div className="space-y-3">
            {activeCoverage.map((coverage, idx) => (
              <div key={idx} className="p-3 bg-green-50 rounded border border-green-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                        ✓ Active Coverage
                      </span>
                      {coverage.coverageLevel && (
                        <span className="text-xs text-gray-600">({coverage.coverageLevel})</span>
                      )}
                      {coverage.coverageLevelCode && (
                        <span className="text-xs text-gray-500">Code: {coverage.coverageLevelCode}</span>
                      )}
                      {coverage.inPlanNetworkIndicatorCode && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          coverage.inPlanNetworkIndicatorCode === 'Y' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {coverage.inPlanNetworkIndicatorCode === 'Y' ? 'In-Network' : 'Out-of-Network'}
                        </span>
                      )}
                    </div>
                    {coverage.planCoverage && (
                      <p className="font-semibold text-gray-900 mb-1">{coverage.planCoverage}</p>
                    )}
                    {coverage.insuranceType && (
                      <p className="text-xs text-gray-600 mb-1">Type: {coverage.insuranceType}</p>
                    )}
                    {coverage.insuranceTypeCode && (
                      <p className="text-xs text-gray-500 mb-1">Insurance Type Code: {coverage.insuranceTypeCode}</p>
                    )}
                    {coverage.serviceTypeCodes && coverage.serviceTypeCodes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2 mb-2">
                        {coverage.serviceTypeCodes.map((code: string) => (
                          <span 
                            key={code}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {SERVICE_TYPE_NAMES[code] || code}
                          </span>
                        ))}
                      </div>
                    )}
                    {coverage.headerLoopIdentifierCode && (
                      <p className="text-xs text-gray-500">Header Loop: {coverage.headerLoopIdentifierCode}</p>
                    )}
                    {coverage.trailerLoopIdentifierCode && (
                      <p className="text-xs text-gray-500">Trailer Loop: {coverage.trailerLoopIdentifierCode}</p>
                    )}
                    {coverage.benefitsRelatedEntities && coverage.benefitsRelatedEntities.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-green-300">
                        <p className="text-xs font-medium text-gray-700 mb-1">Related Entities:</p>
                        {coverage.benefitsRelatedEntities.map((entity: X12Entity, eIdx: number) => (
                          <div key={eIdx} className="text-xs text-gray-600 ml-2">
                            {entity.entityName && <span>{entity.entityName}</span>}
                            {entity.entityIdentifier && <span className="ml-1">({entity.entityIdentifier})</span>}
                            {entity.entityIdentificationValue && <span className="ml-1">- {entity.entityIdentificationValue}</span>}
                            {entity.address && renderAddress(entity.address) && (
                              <div className="ml-2 text-gray-500">{renderAddress(entity.address)}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {coverage.additionalInformation && coverage.additionalInformation.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-green-300">
                        <p className="text-xs font-medium text-gray-700 mb-1">Additional Information:</p>
                        {coverage.additionalInformation.map((info: X12AdditionalInfo, iIdx: number) => (
                          <p key={iIdx} className="text-xs text-gray-600 ml-2">• {info.description}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Primary Care Provider */}
      {primaryCareProvider.length > 0 && (
        <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Primary Care Provider</h2>
          {primaryCareProvider.map((pcp, idx) => {
            const entity = pcp.benefitsRelatedEntity || {};
            return (
              <div key={idx} className="p-3 bg-blue-50 rounded border border-blue-200">
                <div className="space-y-1">
                  {(entity.entityFirstname || entity.entityName) && (
                <p className="font-semibold text-gray-900">
                  {entity.entityFirstname} {entity.entityName}
                </p>
                  )}
                  {entity.entityIdentifier && (
                    <p className="text-xs text-gray-600">Entity Identifier: {entity.entityIdentifier}</p>
                  )}
                  {entity.entityType && (
                    <p className="text-xs text-gray-600">Entity Type: {entity.entityType}</p>
                  )}
                  {entity.address && renderAddress(entity.address) && (
                    <p className="text-sm text-gray-600 mt-1">{renderAddress(entity.address)}</p>
                  )}
                  {pcp.benefitsRelatedEntities && pcp.benefitsRelatedEntities.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-blue-300">
                      <p className="text-xs font-medium text-gray-700 mb-1">Related Entities:</p>
                      {pcp.benefitsRelatedEntities.map((relEntity: X12Entity, eIdx: number) => (
                        <div key={eIdx} className="text-xs text-gray-600 ml-2">
                          {relEntity.entityFirstname && relEntity.entityName && (
                            <span>{relEntity.entityFirstname} {relEntity.entityName}</span>
                          )}
                          {relEntity.entityIdentifier && <span className="ml-1">({relEntity.entityIdentifier})</span>}
                          {relEntity.address && renderAddress(relEntity.address) && (
                            <div className="ml-2 text-gray-500">{renderAddress(relEntity.address)}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {pcp.headerLoopIdentifierCode && (
                    <p className="text-xs text-gray-500 mt-1">Header Loop: {pcp.headerLoopIdentifierCode}</p>
                  )}
                  {pcp.trailerLoopIdentifierCode && (
                    <p className="text-xs text-gray-500">Trailer Loop: {pcp.trailerLoopIdentifierCode}</p>
                )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Deductibles - Matrix Format */}
      {Object.keys(organizedDeductibles).length > 0 && (
        <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Deductibles</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Service Type</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Coverage Level</th>
                  <th colSpan={2} className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase border-l-2 border-gray-300">
                    In-Network
                  </th>
                  <th colSpan={2} className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase border-l-2 border-gray-300">
                    Out-of-Network
                  </th>
                </tr>
                <tr className="bg-gray-50">
                  <th></th>
                  <th></th>
                  <th className="px-3 py-1 text-center text-xs font-medium text-gray-600 border-l-2 border-gray-300">Annual</th>
                  <th className="px-3 py-1 text-center text-xs font-medium text-gray-600">Remaining</th>
                  <th className="px-3 py-1 text-center text-xs font-medium text-gray-600 border-l-2 border-gray-300">Annual</th>
                  <th className="px-3 py-1 text-center text-xs font-medium text-gray-600">Remaining</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(organizedDeductibles).flatMap(([serviceKey, levels]) => {
                  const serviceCodes = serviceKey.split(',');
                  const serviceNames = serviceCodes.map(code => SERVICE_TYPE_NAMES[code] || code).join(', ');
                  const displayName = serviceNames.length > 40 ? serviceNames.substring(0, 40) + '...' : serviceNames || 'All Services';
                  
                  return Object.entries(levels).map(([level, networks], idx) => {
                    // Collect all benefit entries for this row to show additional details
                    const allBenefits = [
                      networks.inNetwork?.annual,
                      networks.inNetwork?.remaining,
                      networks.outNetwork?.annual,
                      networks.outNetwork?.remaining
                    ].filter(Boolean);
                    
                    return (
                      <React.Fragment key={`${serviceKey}-${level}`}>
                        <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50 hover:bg-gray-100'}>
                      <td className="px-3 py-2 text-xs font-medium text-gray-900">
                        {displayName}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">{level}</td>
                      <td className="px-3 py-2 text-xs text-center font-semibold text-gray-900 border-l-2 border-gray-200">
                        {networks.inNetwork?.annual ? formatCurrency(networks.inNetwork.annual.benefitAmount || 0) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-center font-semibold text-gray-900">
                        {networks.inNetwork?.remaining ? formatCurrency(networks.inNetwork.remaining.benefitAmount || 0) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-center font-semibold text-gray-900 border-l-2 border-gray-200">
                        {networks.outNetwork?.annual ? formatCurrency(networks.outNetwork.annual.benefitAmount || 0) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-center font-semibold text-gray-900">
                        {networks.outNetwork?.remaining ? formatCurrency(networks.outNetwork.remaining.benefitAmount || 0) : '—'}
                      </td>
                    </tr>
                        {/* Additional details row */}
                        {allBenefits.some(b => 
                          (b?.additionalInformation?.length ?? 0) > 0 || 
                          b?.eligibilityAdditionalInformation || 
                          b?.timeQualifierCode ||
                          b?.coverageLevelCode ||
                          b?.authOrCertIndicator
                        ) && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-3 py-2 text-xs text-gray-600">
                              <div className="space-y-1">
                                {allBenefits.map((benefit, bIdx: number) => (
                                  benefit && (
                                    <div key={bIdx} className="pl-2 border-l-2 border-gray-300">
                                      {benefit.timeQualifier && (
                                        <span className="mr-2">Period: {benefit.timeQualifier}</span>
                                      )}
                                      {benefit.timeQualifierCode && (
                                        <span className="mr-2">Period Code: {benefit.timeQualifierCode}</span>
                                      )}
                                      {benefit.coverageLevelCode && (
                                        <span className="mr-2">Level Code: {benefit.coverageLevelCode}</span>
                                      )}
                                      {benefit.authOrCertIndicator && (
                                        <span className="mr-2">Auth/Cert: {benefit.authOrCertIndicator}</span>
                                      )}
                                      {benefit.additionalInformation?.map((info: X12AdditionalInfo, iIdx: number) => (
                                        <span key={iIdx} className="mr-2 text-orange-700">• {info.description}</span>
                                      ))}
                                      {benefit.eligibilityAdditionalInformation && (
                                        <div className="mt-1 text-gray-500">
                                          Eligibility Info: {benefit.eligibilityAdditionalInformation.codeListQualifierCode} - {benefit.eligibilityAdditionalInformation.industryCode}
                                        </div>
                                      )}
                                    </div>
                                  )
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Out of Pocket Maximum - Matrix Format */}
      {Object.keys(organizedOOPMax).length > 0 && (
        <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Out of Pocket Maximum</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Service Type</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Coverage Level</th>
                  <th colSpan={2} className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase border-l-2 border-gray-300">
                    In-Network
                  </th>
                  <th colSpan={2} className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase border-l-2 border-gray-300">
                    Out-of-Network
                  </th>
                </tr>
                <tr className="bg-gray-50">
                  <th></th>
                  <th></th>
                  <th className="px-3 py-1 text-center text-xs font-medium text-gray-600 border-l-2 border-gray-300">Annual</th>
                  <th className="px-3 py-1 text-center text-xs font-medium text-gray-600">Remaining</th>
                  <th className="px-3 py-1 text-center text-xs font-medium text-gray-600 border-l-2 border-gray-300">Annual</th>
                  <th className="px-3 py-1 text-center text-xs font-medium text-gray-600">Remaining</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(organizedOOPMax).flatMap(([serviceKey, levels]) => {
                  const serviceCodes = serviceKey.split(',');
                  const serviceNames = serviceCodes.map(code => SERVICE_TYPE_NAMES[code] || code).join(', ');
                  const displayName = serviceNames.length > 40 ? serviceNames.substring(0, 40) + '...' : serviceNames || 'All Services';
                  
                  return Object.entries(levels).map(([level, networks], idx) => {
                    const allBenefits = [
                      networks.inNetwork?.annual,
                      networks.inNetwork?.remaining,
                      networks.outNetwork?.annual,
                      networks.outNetwork?.remaining
                    ].filter(Boolean);
                    
                    return (
                      <React.Fragment key={`${serviceKey}-${level}`}>
                        <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50 hover:bg-gray-100'}>
                      <td className="px-3 py-2 text-xs font-medium text-gray-900">
                        {displayName}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">{level}</td>
                      <td className="px-3 py-2 text-xs text-center font-semibold text-gray-900 border-l-2 border-gray-200">
                        {networks.inNetwork?.annual ? formatCurrency(networks.inNetwork.annual.benefitAmount || 0) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-center font-semibold text-gray-900">
                        {networks.inNetwork?.remaining ? formatCurrency(networks.inNetwork.remaining.benefitAmount || 0) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-center font-semibold text-gray-900 border-l-2 border-gray-200">
                        {networks.outNetwork?.annual ? formatCurrency(networks.outNetwork.annual.benefitAmount || 0) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-center font-semibold text-gray-900">
                        {networks.outNetwork?.remaining ? formatCurrency(networks.outNetwork.remaining.benefitAmount || 0) : '—'}
                      </td>
                    </tr>
                        {allBenefits.some(b => 
                          (b?.additionalInformation?.length ?? 0) > 0 || 
                          b?.eligibilityAdditionalInformation || 
                          b?.timeQualifierCode ||
                          b?.coverageLevelCode ||
                          b?.authOrCertIndicator
                        ) && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-3 py-2 text-xs text-gray-600">
                              <div className="space-y-1">
                                {allBenefits.map((benefit, bIdx: number) => (
                                  benefit && (
                                    <div key={bIdx} className="pl-2 border-l-2 border-gray-300">
                                      {benefit.timeQualifier && <span className="mr-2">Period: {benefit.timeQualifier}</span>}
                                      {benefit.timeQualifierCode && <span className="mr-2">Period Code: {benefit.timeQualifierCode}</span>}
                                      {benefit.coverageLevelCode && <span className="mr-2">Level Code: {benefit.coverageLevelCode}</span>}
                                      {benefit.authOrCertIndicator && <span className="mr-2">Auth/Cert: {benefit.authOrCertIndicator}</span>}
                                      {benefit.additionalInformation?.map((info: X12AdditionalInfo, iIdx: number) => (
                                        <span key={iIdx} className="mr-2 text-orange-700">• {info.description}</span>
                                      ))}
                                      {benefit.eligibilityAdditionalInformation && (
                                        <div className="mt-1 text-gray-500">
                                          Eligibility Info: {benefit.eligibilityAdditionalInformation.codeListQualifierCode} - {benefit.eligibilityAdditionalInformation.industryCode}
                                        </div>
                                      )}
                                    </div>
                                  )
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Co-Payments - Grouped by Service */}
      {Object.keys(organizedCopays).length > 0 && (
        <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Co-Payments</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Service Type</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase border-l-2 border-gray-300">In-Network</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase border-l-2 border-gray-300">Out-of-Network</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(organizedCopays).map(([serviceKey, networks]) => {
                  const serviceCodes = serviceKey.split(',');
                  const serviceNames = serviceCodes.map(code => SERVICE_TYPE_NAMES[code] || code).join(', ');
                  
                  // Get all copay entries (not just unique amounts) to show details
                  const allCopays = [
                    ...(networks.inNetwork || []),
                    ...(networks.outNetwork || [])
                  ];
                  
                  // Get unique amounts for display
                  const inNetworkAmounts = networks.inNetwork 
                    ? [...new Set(networks.inNetwork.map((c) => formatCurrency(c.benefitAmount || 0)))]
                    : [];
                  const outNetworkAmounts = networks.outNetwork 
                    ? [...new Set(networks.outNetwork.map((c) => formatCurrency(c.benefitAmount || 0)))]
                    : [];
                  
                  const hasAdditionalInfo = allCopays.some((c) => 
                    (c?.additionalInformation?.length ?? 0) > 0 || 
                    c?.eligibilityAdditionalInformation ||
                    (c?.eligibilityAdditionalInformationList?.length ?? 0) > 0 ||
                    c?.authOrCertIndicator ||
                    c?.coverageLevelCode ||
                    c?.coverageLevel
                  );
                  
                  return (
                    <React.Fragment key={serviceKey}>
                      <tr className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs font-medium text-gray-900">
                        {serviceNames.length > 50 ? serviceNames.substring(0, 50) + '...' : serviceNames || 'All Services'}
                      </td>
                      <td className="px-3 py-2 text-xs text-center font-semibold text-gray-900 border-l-2 border-gray-200">
                        {inNetworkAmounts.length > 0 ? (
                          <div className="space-y-0.5">
                            {inNetworkAmounts.map((amt, i) => (
                              <div key={i}>{amt}</div>
                            ))}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-center font-semibold text-gray-900 border-l-2 border-gray-200">
                        {outNetworkAmounts.length > 0 ? (
                          <div className="space-y-0.5">
                            {outNetworkAmounts.map((amt, i) => (
                              <div key={i}>{amt}</div>
                            ))}
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                      {hasAdditionalInfo && (
                        <tr className="bg-gray-50">
                          <td colSpan={3} className="px-3 py-2 text-xs text-gray-600">
                            <div className="space-y-2">
                              {allCopays.map((copay, cIdx: number) => (
                                copay && ((copay.additionalInformation?.length ?? 0) > 0 || copay.eligibilityAdditionalInformation || (copay.eligibilityAdditionalInformationList?.length ?? 0) > 0) && (
                                  <div key={cIdx} className="pl-2 border-l-2 border-gray-300">
                                    <div className="flex items-center gap-2 mb-1">
                                      {copay.coverageLevel && <span className="font-medium">Level: {copay.coverageLevel}</span>}
                                      {copay.coverageLevelCode && <span>Code: {copay.coverageLevelCode}</span>}
                                      {copay.authOrCertIndicator && <span>Auth/Cert: {copay.authOrCertIndicator}</span>}
                                      {copay.inPlanNetworkIndicatorCode && (
                                        <span className={copay.inPlanNetworkIndicatorCode === 'Y' ? 'text-blue-700' : 'text-orange-700'}>
                                          {copay.inPlanNetworkIndicatorCode === 'Y' ? 'In-Network' : 'Out-of-Network'}
                                        </span>
                                      )}
                                    </div>
                                    {copay.additionalInformation?.map((info: X12AdditionalInfo, iIdx: number) => (
                                      <div key={iIdx} className="text-orange-700">• {info.description}</div>
                                    ))}
                                    {copay.eligibilityAdditionalInformation && (
                                      <div className="text-gray-500 mt-1">
                                        Eligibility: {copay.eligibilityAdditionalInformation.codeListQualifierCode} - {copay.eligibilityAdditionalInformation.industryCode}
                                      </div>
                                    )}
                                    {copay.eligibilityAdditionalInformationList?.map((info: X12AdditionalInfo, iIdx: number) => (
                                      <div key={iIdx} className="text-gray-500 text-xs mt-1">
                                        {info.codeListQualifierCode} - {info.industryCode}
                                      </div>
                                    ))}
                                  </div>
                                )
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Co-Insurance - Grouped by Service */}
      {Object.keys(organizedCoinsurance).length > 0 && (
        <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Co-Insurance</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Service Type</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase border-l-2 border-gray-300">In-Network</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase border-l-2 border-gray-300">Out-of-Network</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(organizedCoinsurance).map(([serviceKey, networks]) => {
                  const serviceCodes = serviceKey.split(',');
                  const serviceNames = serviceCodes.map(code => SERVICE_TYPE_NAMES[code] || code).join(', ');
                  
                  // Get all coinsurance entries to show details
                  const allCoinsurance = [
                    ...(networks.inNetwork || []),
                    ...(networks.outNetwork || [])
                  ];
                  
                  // Get unique percentages for display
                  const inNetworkPercents = networks.inNetwork 
                    ? [...new Set(networks.inNetwork.map((c) => formatPercent(c.benefitPercent || 0)))]
                    : [];
                  const outNetworkPercents = networks.outNetwork 
                    ? [...new Set(networks.outNetwork.map((c) => formatPercent(c.benefitPercent || 0)))]
                    : [];
                  
                  const hasAdditionalInfo = allCoinsurance.some((c) => 
                    (c?.additionalInformation?.length ?? 0) > 0 || 
                    c?.eligibilityAdditionalInformation ||
                    (c?.eligibilityAdditionalInformationList?.length ?? 0) > 0 ||
                    c?.authOrCertIndicator ||
                    c?.coverageLevelCode ||
                    c?.coverageLevel
                  );
                  
                  return (
                    <React.Fragment key={serviceKey}>
                      <tr className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs font-medium text-gray-900">
                        {serviceNames.length > 50 ? serviceNames.substring(0, 50) + '...' : serviceNames || 'All Services'}
                      </td>
                      <td className="px-3 py-2 text-xs text-center font-semibold text-gray-900 border-l-2 border-gray-200">
                        {inNetworkPercents.length > 0 ? (
                          <div className="space-y-0.5">
                            {inNetworkPercents.map((pct, i) => (
                              <div key={i}>{pct}</div>
                            ))}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-center font-semibold text-gray-900 border-l-2 border-gray-200">
                        {outNetworkPercents.length > 0 ? (
                          <div className="space-y-0.5">
                            {outNetworkPercents.map((pct, i) => (
                              <div key={i}>{pct}</div>
                            ))}
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                      {hasAdditionalInfo && (
                        <tr className="bg-gray-50">
                          <td colSpan={3} className="px-3 py-2 text-xs text-gray-600">
                            <div className="space-y-2">
                              {allCoinsurance.map((coinsurance, cIdx: number) => (
                                coinsurance && ((coinsurance.additionalInformation?.length ?? 0) > 0 || coinsurance.eligibilityAdditionalInformation || (coinsurance.eligibilityAdditionalInformationList?.length ?? 0) > 0) && (
                                  <div key={cIdx} className="pl-2 border-l-2 border-gray-300">
                                    <div className="flex items-center gap-2 mb-1">
                                      {coinsurance.coverageLevel && <span className="font-medium">Level: {coinsurance.coverageLevel}</span>}
                                      {coinsurance.coverageLevelCode && <span>Code: {coinsurance.coverageLevelCode}</span>}
                                      {coinsurance.authOrCertIndicator && <span>Auth/Cert: {coinsurance.authOrCertIndicator}</span>}
                                      {coinsurance.inPlanNetworkIndicatorCode && (
                                        <span className={coinsurance.inPlanNetworkIndicatorCode === 'Y' ? 'text-blue-700' : 'text-orange-700'}>
                                          {coinsurance.inPlanNetworkIndicatorCode === 'Y' ? 'In-Network' : 'Out-of-Network'}
                                        </span>
                                      )}
                                    </div>
                                    {coinsurance.additionalInformation?.map((info: X12AdditionalInfo, iIdx: number) => (
                                      <div key={iIdx} className="text-orange-700">• {info.description}</div>
                                    ))}
                                    {coinsurance.eligibilityAdditionalInformation && (
                                      <div className="text-gray-500 mt-1">
                                        Eligibility: {coinsurance.eligibilityAdditionalInformation.codeListQualifierCode} - {coinsurance.eligibilityAdditionalInformation.industryCode}
                                      </div>
                                    )}
                                    {coinsurance.eligibilityAdditionalInformationList?.map((info: X12AdditionalInfo, iIdx: number) => (
                                      <div key={iIdx} className="text-gray-500 text-xs mt-1">
                                        {info.codeListQualifierCode} - {info.industryCode}
                                      </div>
                                    ))}
                                  </div>
                                )
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Secondary Payors */}
      {secondaryPayors.length > 0 && (
        <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Secondary/Additional Payors</h2>
          <div className="space-y-2">
            {secondaryPayors.map((payor, idx) => {
              const entity = payor.benefitsRelatedEntity || {};
              return (
                <div key={idx} className="p-3 bg-yellow-50 rounded border border-yellow-200">
                  <div className="space-y-1">
                  <p className="font-medium text-gray-900">{entity.entityName || 'Unknown'}</p>
                    {entity.entityIdentifier && (
                      <p className="text-xs text-gray-600">Entity Identifier: {entity.entityIdentifier}</p>
                    )}
                    {entity.entityType && (
                      <p className="text-xs text-gray-600">Entity Type: {entity.entityType}</p>
                    )}
                  {payor.serviceTypeCodes && payor.serviceTypeCodes.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-gray-700 mb-1">Services:</p>
                        <div className="flex flex-wrap gap-1">
                          {payor.serviceTypeCodes.map((code: string) => (
                            <span key={code} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              {SERVICE_TYPE_NAMES[code] || code}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {payor.insuranceType && (
                      <p className="text-xs text-gray-600">Insurance Type: {payor.insuranceType}</p>
                    )}
                    {payor.insuranceTypeCode && (
                      <p className="text-xs text-gray-600">Insurance Type Code: {payor.insuranceTypeCode}</p>
                    )}
                    {payor.benefitsRelatedEntities && payor.benefitsRelatedEntities.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-yellow-300">
                        <p className="text-xs font-medium text-gray-700 mb-1">Related Entities:</p>
                        {payor.benefitsRelatedEntities.map((relEntity: X12Entity, eIdx: number) => (
                          <div key={eIdx} className="text-xs text-gray-600 ml-2">
                            {relEntity.entityName && <span>{relEntity.entityName}</span>}
                            {relEntity.entityIdentifier && <span className="ml-1">({relEntity.entityIdentifier})</span>}
                            {relEntity.address && renderAddress(relEntity.address) && (
                              <div className="ml-2 text-gray-500">{renderAddress(relEntity.address)}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {payor.headerLoopIdentifierCode && (
                      <p className="text-xs text-gray-500 mt-1">Header Loop: {payor.headerLoopIdentifierCode}</p>
                    )}
                    {payor.trailerLoopIdentifierCode && (
                      <p className="text-xs text-gray-500">Trailer Loop: {payor.trailerLoopIdentifierCode}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Limitations */}
      {limitations.length > 0 && (
        <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Limitations & Requirements</h2>
          <div className="space-y-2">
            {limitations.map((lim, idx) => (
              <div key={idx} className="p-3 bg-orange-50 rounded border border-orange-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {lim.serviceTypeCodes && lim.serviceTypeCodes.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-gray-700 mb-1">Service Types:</p>
                        <div className="flex flex-wrap gap-1">
                          {lim.serviceTypeCodes.map((code: string) => (
                            <span key={code} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                              {SERVICE_TYPE_NAMES[code] || code}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {lim.additionalInformation?.map((info: X12AdditionalInfo, i: number) => (
                      <p key={i} className="text-xs text-gray-700">• {info.description}</p>
                    ))}
                    {lim.headerLoopIdentifierCode && (
                      <p className="text-xs text-gray-500 mt-1">Header Loop: {lim.headerLoopIdentifierCode}</p>
                    )}
                    {lim.trailerLoopIdentifierCode && (
                      <p className="text-xs text-gray-500">Trailer Loop: {lim.trailerLoopIdentifierCode}</p>
                    )}
                  </div>
                  {lim.inPlanNetworkIndicatorCode && (
                  <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    lim.inPlanNetworkIndicatorCode === 'Y' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {lim.inPlanNetworkIndicator === 'Yes' ? 'IN' : lim.inPlanNetworkIndicator === 'No' ? 'OUT' : 'N/A'}
                  </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Additional Response Information */}
      {(response.status || response.transactionSetAcknowledgement || response.implementationTransactionSetSyntaxError) && (
        <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Response Status</h2>
          <div className="space-y-2 text-sm">
            {response.status && <KeyValueDisplay label="Status" value={response.status} />}
            {response.transactionSetAcknowledgement && <KeyValueDisplay label="Transaction Set Acknowledgement" value={response.transactionSetAcknowledgement} />}
            {response.implementationTransactionSetSyntaxError && (
              <div className="p-2 bg-red-50 rounded border border-red-200">
                <KeyValueDisplay label="Implementation Transaction Set Syntax Error" value={response.implementationTransactionSetSyntaxError} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Errors */}
      {response.errors && response.errors.length > 0 && (
        <div className="bg-white border border-red-300 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-3 text-red-800 border-b border-red-300 pb-2">Errors</h2>
          <div className="space-y-2">
            {response.errors.map((error, idx) => (
              <div key={idx} className="p-3 bg-red-50 rounded border border-red-200">
                <p className="text-sm font-medium text-red-900">{error.field || 'Error'}</p>
                <p className="text-sm text-red-700 mt-1">{error.description || error.message || 'Unknown error'}</p>
                {error.code && (
                  <p className="text-xs text-red-600 mt-1">Code: {error.code}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

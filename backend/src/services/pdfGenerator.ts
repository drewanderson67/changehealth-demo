import PDFDocument from 'pdfkit';
import type { ClaimSubmissionRequest } from './types';

// CMS 1500 form dimensions (in points, 72 points = 1 inch)
const FORM_WIDTH = 612; // 8.5 inches
const FORM_HEIGHT = 792; // 11 inches
const MARGIN_LEFT = 36;
const MARGIN_TOP = 36;
const BOX_WIDTH = 60;
const BOX_HEIGHT = 20;
const LINE_HEIGHT = 24;

interface BoxPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Define box positions (approximate CMS 1500 layout)
const BOX_POSITIONS: Record<string, BoxPosition> = {
  // Row 1
  '1': { x: MARGIN_LEFT, y: MARGIN_TOP, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  '2': { x: MARGIN_LEFT + BOX_WIDTH * 2.5, y: MARGIN_TOP, width: BOX_WIDTH * 1.5, height: BOX_HEIGHT },
  
  // Row 2 - Patient Name
  '3': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT, width: BOX_WIDTH * 4, height: BOX_HEIGHT },
  
  // Row 3 - Patient DOB, Sex
  '4': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 2, width: BOX_WIDTH * 1.5, height: BOX_HEIGHT },
  '5': { x: MARGIN_LEFT + BOX_WIDTH * 1.6, y: MARGIN_TOP + LINE_HEIGHT * 2, width: BOX_WIDTH * 0.5, height: BOX_HEIGHT },
  
  // Row 4 - Patient Address
  '6': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 3, width: BOX_WIDTH * 4, height: BOX_HEIGHT },
  
  // Row 5 - Patient City, State, ZIP
  '7': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 4, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  '8': { x: MARGIN_LEFT + BOX_WIDTH * 2.1, y: MARGIN_TOP + LINE_HEIGHT * 4, width: BOX_WIDTH * 0.8, height: BOX_HEIGHT },
  '9': { x: MARGIN_LEFT + BOX_WIDTH * 3, y: MARGIN_TOP + LINE_HEIGHT * 4, width: BOX_WIDTH, height: BOX_HEIGHT },
  
  // Row 6 - Patient Phone
  '10': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 5, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  
  // Row 7 - Patient SSN
  '11': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 6, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  
  // Row 8 - Patient Relationship
  '11a': { x: MARGIN_LEFT + BOX_WIDTH * 2.2, y: MARGIN_TOP + LINE_HEIGHT * 6, width: BOX_WIDTH * 0.5, height: BOX_HEIGHT },
  
  // Row 9 - Subscriber Name
  '12': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 7, width: BOX_WIDTH * 4, height: BOX_HEIGHT },
  
  // Row 10 - Subscriber DOB, Sex
  '13': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 8, width: BOX_WIDTH * 1.5, height: BOX_HEIGHT },
  '13a': { x: MARGIN_LEFT + BOX_WIDTH * 1.6, y: MARGIN_TOP + LINE_HEIGHT * 8, width: BOX_WIDTH * 0.5, height: BOX_HEIGHT },
  
  // Row 11 - Insured Name
  '14': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 9, width: BOX_WIDTH * 4, height: BOX_HEIGHT },
  
  // Row 12 - Patient Condition
  '15': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 10, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  
  // Row 13 - Other Insured
  '16': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 11, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  
  // Row 14 - Patient Employment
  '17': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 12, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  
  // Row 15 - Reserved
  '18': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 13, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  
  // Row 16 - Reserved
  '19': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 14, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  
  // Row 17 - Outside Lab
  '20': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 15, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  
  // Row 18 - Diagnosis Codes
  '21': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 16, width: BOX_WIDTH * 4, height: BOX_HEIGHT * 2 },
  
  // Row 19 - Medicaid Resubmission
  '22': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 18, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  
  // Row 20 - Prior Auth
  '23': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 19, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  
  // Service Lines (24a-24j) - Right side
  '24a': { x: MARGIN_LEFT + BOX_WIDTH * 4.5, y: MARGIN_TOP + LINE_HEIGHT * 10, width: BOX_WIDTH * 0.8, height: BOX_HEIGHT },
  '24b': { x: MARGIN_LEFT + BOX_WIDTH * 5.4, y: MARGIN_TOP + LINE_HEIGHT * 10, width: BOX_WIDTH * 1.2, height: BOX_HEIGHT },
  '24c': { x: MARGIN_LEFT + BOX_WIDTH * 6.7, y: MARGIN_TOP + LINE_HEIGHT * 10, width: BOX_WIDTH * 0.5, height: BOX_HEIGHT },
  '24d': { x: MARGIN_LEFT + BOX_WIDTH * 7.3, y: MARGIN_TOP + LINE_HEIGHT * 10, width: BOX_WIDTH * 0.8, height: BOX_HEIGHT },
  '24e': { x: MARGIN_LEFT + BOX_WIDTH * 8.2, y: MARGIN_TOP + LINE_HEIGHT * 10, width: BOX_WIDTH * 0.5, height: BOX_HEIGHT },
  '24f': { x: MARGIN_LEFT + BOX_WIDTH * 8.8, y: MARGIN_TOP + LINE_HEIGHT * 10, width: BOX_WIDTH * 0.5, height: BOX_HEIGHT },
  '24g': { x: MARGIN_LEFT + BOX_WIDTH * 9.4, y: MARGIN_TOP + LINE_HEIGHT * 10, width: BOX_WIDTH * 0.5, height: BOX_HEIGHT },
  '24h': { x: MARGIN_LEFT + BOX_WIDTH * 10, y: MARGIN_TOP + LINE_HEIGHT * 10, width: BOX_WIDTH * 0.5, height: BOX_HEIGHT },
  '24i': { x: MARGIN_LEFT + BOX_WIDTH * 10.6, y: MARGIN_TOP + LINE_HEIGHT * 10, width: BOX_WIDTH * 0.5, height: BOX_HEIGHT },
  '24j': { x: MARGIN_LEFT + BOX_WIDTH * 11.2, y: MARGIN_TOP + LINE_HEIGHT * 10, width: BOX_WIDTH * 0.5, height: BOX_HEIGHT },
  
  // Billing Provider (25-33a) - Bottom section
  '25': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 20, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  '26': { x: MARGIN_LEFT + BOX_WIDTH * 2.2, y: MARGIN_TOP + LINE_HEIGHT * 20, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  '27': { x: MARGIN_LEFT + BOX_WIDTH * 4.3, y: MARGIN_TOP + LINE_HEIGHT * 20, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  '28': { x: MARGIN_LEFT + BOX_WIDTH * 6.4, y: MARGIN_TOP + LINE_HEIGHT * 20, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  '29': { x: MARGIN_LEFT + BOX_WIDTH * 8.5, y: MARGIN_TOP + LINE_HEIGHT * 20, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  '30': { x: MARGIN_LEFT, y: MARGIN_TOP + LINE_HEIGHT * 21, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  '31': { x: MARGIN_LEFT + BOX_WIDTH * 2.2, y: MARGIN_TOP + LINE_HEIGHT * 21, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  '32': { x: MARGIN_LEFT + BOX_WIDTH * 4.3, y: MARGIN_TOP + LINE_HEIGHT * 21, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  '33': { x: MARGIN_LEFT + BOX_WIDTH * 6.4, y: MARGIN_TOP + LINE_HEIGHT * 21, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
  '33a': { x: MARGIN_LEFT + BOX_WIDTH * 8.5, y: MARGIN_TOP + LINE_HEIGHT * 21, width: BOX_WIDTH * 2, height: BOX_HEIGHT },
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  // Convert YYYYMMDD to MM/DD/YYYY
  if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
    return `${dateStr.substring(4, 6)}/${dateStr.substring(6, 8)}/${dateStr.substring(0, 4)}`;
  }
  return dateStr;
}

function formatSSN(ssn: string): string {
  if (!ssn) return '';
  // Format as XXX-XX-XXXX
  const cleaned = ssn.replace(/\D/g, '');
  if (cleaned.length === 9) {
    return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 5)}-${cleaned.substring(5, 9)}`;
  }
  return ssn;
}

function formatPhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.substring(0, 3)}) ${cleaned.substring(3, 6)}-${cleaned.substring(6, 10)}`;
  }
  return phone;
}

function drawBox(doc: PDFKit.PDFDocument, boxNum: number | string, label: string, value: string) {
  const pos = BOX_POSITIONS[boxNum];
  if (!pos) return;
  
  // Draw box border
  doc.rect(pos.x, pos.y, pos.width, pos.height).stroke();
  
  // Draw label
  doc.fontSize(8)
     .fillColor('black')
     .text(label, pos.x + 2, pos.y - 10);
  
  // Draw value
  if (value) {
    doc.fontSize(10)
       .fillColor('black')
       .text(value.substring(0, Math.floor(pos.width / 6)), pos.x + 2, pos.y + 4, {
         width: pos.width - 4,
         height: pos.height - 4
       });
  }
}

export function writeCMS1500PDF(
  claimData: ClaimSubmissionRequest,
  onChunk: (chunk: Buffer) => void,
  onEnd?: () => void
): void {
  const doc = new PDFDocument({
    size: [FORM_WIDTH, FORM_HEIGHT],
    margins: { top: 0, bottom: 0, left: 0, right: 0 }
  });

  doc.on('data', onChunk);
  if (onEnd) doc.on('end', onEnd);
  
  // Title
  doc.fontSize(16)
     .fillColor('black')
     .text('CMS-1500', MARGIN_LEFT, MARGIN_TOP - 20);
  
  // Box 1 - Insurance Type
  const insuranceType = claimData.claimInformation?.claimFilingCode || '';
  drawBox(doc, 1, '1. MEDICARE', insuranceType === 'MB' ? 'X' : '');
  drawBox(doc, 2, '2. MEDICAID', insuranceType === 'MC' ? 'X' : '');
  
  // Box 3 - Patient Name
  const patientName = claimData.dependent 
    ? `${claimData.dependent.firstName || ''} ${claimData.dependent.lastName || ''}`.trim()
    : `${claimData.subscriber.firstName || ''} ${claimData.subscriber.lastName || ''}`.trim();
  drawBox(doc, 3, '3. PATIENT\'S NAME', patientName);
  
  // Box 4 - Patient DOB and Sex
  const patientDOB = claimData.dependent?.dateOfBirth || claimData.subscriber.dateOfBirth || '';
  const patientGender = claimData.dependent?.gender || claimData.subscriber.gender || '';
  drawBox(doc, 4, '4. PATIENT\'S BIRTH DATE', formatDate(patientDOB));
  drawBox(doc, 5, 'SEX', patientGender);
  
  // Box 6 - Patient Address
  const patientAddress = claimData.dependent?.address || claimData.subscriber.address;
  const addressLine = patientAddress 
    ? `${patientAddress.address1 || ''} ${patientAddress.address2 || ''}`.trim()
    : '';
  drawBox(doc, 6, '6. PATIENT ADDRESS', addressLine);
  
  // Box 7 - Patient City, State, ZIP
  drawBox(doc, 7, '7. CITY', patientAddress?.city || '');
  drawBox(doc, 8, 'STATE', patientAddress?.state || '');
  drawBox(doc, 9, 'ZIP', patientAddress?.postalCode || '');
  
  // Box 10 - Patient Phone
  const patientPhone = claimData.dependent?.contactInformation?.phoneNumber || 
                       claimData.subscriber.contactInformation?.phoneNumber || '';
  drawBox(doc, 10, '10. PATIENT\'S PHONE', formatPhone(patientPhone));
  
  // Box 11 - Patient SSN
  const patientSSN = claimData.dependent?.ssn || claimData.subscriber.ssn || '';
  drawBox(doc, 11, '11. PATIENT\'S SSN', formatSSN(patientSSN));
  
  // Box 12 - Subscriber Name
  const subscriberName = `${claimData.subscriber.firstName || ''} ${claimData.subscriber.lastName || ''}`.trim();
  drawBox(doc, 12, '12. PATIENT\'S OR SUBSCRIBER\'S NAME', subscriberName);
  
  // Box 13 - Subscriber DOB and Sex
  drawBox(doc, 13, '13. PATIENT\'S OR SUBSCRIBER\'S BIRTH DATE', formatDate(claimData.subscriber.dateOfBirth || ''));
  drawBox(doc, '13a', 'SEX', claimData.subscriber.gender || '');
  
  // Box 14 - Insured Name (same as subscriber if not different)
  drawBox(doc, 14, '14. INSURED\'S NAME', subscriberName);
  
  // Box 21 - Diagnosis Codes
  const diagnoses = claimData.claimInformation?.healthCareCodeInformation || [];
  const diagnosisCodes = diagnoses
    .slice(0, 4)
    .map(d => d.diagnosisCode || '')
    .join(', ');
  drawBox(doc, 21, '21. DIAGNOSIS OR NATURE OF ILLNESS OR INJURY', diagnosisCodes);
  
  // Box 23 - Prior Authorization
  const priorAuth = claimData.claimInformation?.claimSupplementalInformation?.priorAuthorizationNumber || '';
  drawBox(doc, 23, '23. PRIOR AUTHORIZATION NUMBER', priorAuth);
  
  // Service Lines (24a-24j) - Up to 6 lines
  const serviceLines = claimData.claimInformation?.serviceLines || [];
  serviceLines.slice(0, 6).forEach((line, index) => {
    const yOffset = LINE_HEIGHT * index;
    const serviceDate = formatDate(line.serviceDate || '');
    const placeOfService = line.professionalService?.placeOfServiceCode || 
                          claimData.claimInformation?.placeOfServiceCode || '';
    const procedureCode = line.professionalService?.procedureCode || '';
    const modifiers = line.professionalService?.procedureModifiers?.join(' ') || '';
    const diagnosisPointer = line.professionalService?.compositeDiagnosisCodePointers?.diagnosisCodePointers?.[0] || '1';
    const chargeAmount = line.professionalService?.lineItemChargeAmount || '';
    const units = line.professionalService?.serviceUnitCount || '';
    
    // 24a - Date of Service
    doc.rect(BOX_POSITIONS['24a'].x, BOX_POSITIONS['24a'].y + yOffset, BOX_POSITIONS['24a'].width, BOX_POSITIONS['24a'].height).stroke();
    doc.fontSize(8).text(serviceDate, BOX_POSITIONS['24a'].x + 2, BOX_POSITIONS['24a'].y + yOffset + 4);
    
    // 24b - Place of Service
    doc.rect(BOX_POSITIONS['24b'].x, BOX_POSITIONS['24b'].y + yOffset, BOX_POSITIONS['24b'].width, BOX_POSITIONS['24b'].height).stroke();
    doc.fontSize(8).text(placeOfService, BOX_POSITIONS['24b'].x + 2, BOX_POSITIONS['24b'].y + yOffset + 4);
    
    // 24c - EMG
    doc.rect(BOX_POSITIONS['24c'].x, BOX_POSITIONS['24c'].y + yOffset, BOX_POSITIONS['24c'].width, BOX_POSITIONS['24c'].height).stroke();
    
    // 24d - Procedures/Modifiers
    doc.rect(BOX_POSITIONS['24d'].x, BOX_POSITIONS['24d'].y + yOffset, BOX_POSITIONS['24d'].width, BOX_POSITIONS['24d'].height).stroke();
    doc.fontSize(8).text(`${procedureCode} ${modifiers}`.trim(), BOX_POSITIONS['24d'].x + 2, BOX_POSITIONS['24d'].y + yOffset + 4);
    
    // 24e - Diagnosis Pointer
    doc.rect(BOX_POSITIONS['24e'].x, BOX_POSITIONS['24e'].y + yOffset, BOX_POSITIONS['24e'].width, BOX_POSITIONS['24e'].height).stroke();
    doc.fontSize(8).text(diagnosisPointer, BOX_POSITIONS['24e'].x + 2, BOX_POSITIONS['24e'].y + yOffset + 4);
    
    // 24f - Charges
    doc.rect(BOX_POSITIONS['24f'].x, BOX_POSITIONS['24f'].y + yOffset, BOX_POSITIONS['24f'].width, BOX_POSITIONS['24f'].height).stroke();
    doc.fontSize(8).text(chargeAmount, BOX_POSITIONS['24f'].x + 2, BOX_POSITIONS['24f'].y + yOffset + 4);
    
    // 24g - Days/Units
    doc.rect(BOX_POSITIONS['24g'].x, BOX_POSITIONS['24g'].y + yOffset, BOX_POSITIONS['24g'].width, BOX_POSITIONS['24g'].height).stroke();
    doc.fontSize(8).text(units, BOX_POSITIONS['24g'].x + 2, BOX_POSITIONS['24g'].y + yOffset + 4);
    
    // 24h - EPSDT
    doc.rect(BOX_POSITIONS['24h'].x, BOX_POSITIONS['24h'].y + yOffset, BOX_POSITIONS['24h'].width, BOX_POSITIONS['24h'].height).stroke();
    
    // 24i - ID Qualifier
    doc.rect(BOX_POSITIONS['24i'].x, BOX_POSITIONS['24i'].y + yOffset, BOX_POSITIONS['24i'].width, BOX_POSITIONS['24i'].height).stroke();
    
    // 24j - Rendering Provider NPI
    const renderingNPI = claimData.rendering?.npi || claimData.billing?.npi || '';
    doc.rect(BOX_POSITIONS['24j'].x, BOX_POSITIONS['24j'].y + yOffset, BOX_POSITIONS['24j'].width, BOX_POSITIONS['24j'].height).stroke();
    doc.fontSize(8).text(renderingNPI.substring(0, 10), BOX_POSITIONS['24j'].x + 2, BOX_POSITIONS['24j'].y + yOffset + 4);
  });
  
  // Box 25 - Federal Tax ID
  const taxId = claimData.billing?.employerId || claimData.billing?.ssn || '';
  drawBox(doc, 25, '25. FEDERAL TAX I.D. NUMBER', taxId);
  
  // Box 26 - Patient Account Number
  const accountNumber = claimData.claimInformation?.patientControlNumber || '';
  drawBox(doc, 26, '26. PATIENT\'S ACCOUNT NO.', accountNumber);
  
  // Box 27 - Accept Assignment
  const acceptAssignment = claimData.claimInformation?.planParticipationCode === 'A' ? 'YES' : 'NO';
  drawBox(doc, 27, '27. ACCEPT ASSIGNMENT?', acceptAssignment);
  
  // Box 28 - Total Charge
  const totalCharge = claimData.claimInformation?.claimChargeAmount || '';
  drawBox(doc, 28, '28. TOTAL CHARGE', totalCharge);
  
  // Box 29 - Amount Paid
  const amountPaid = claimData.claimInformation?.patientAmountPaid || '0.00';
  drawBox(doc, 29, '29. AMOUNT PAID', amountPaid);
  
  // Box 30 - Balance Due
  const balanceDue = (parseFloat(totalCharge) - parseFloat(amountPaid)).toFixed(2);
  drawBox(doc, 30, '30. BALANCE DUE', balanceDue);
  
  // Box 31 - Signature
  drawBox(doc, 31, '31. SIGNATURE OF PHYSICIAN', '');
  
  // Box 32 - Service Facility
  const facilityName = claimData.claimInformation?.serviceFacilityLocation?.organizationName || 
                       claimData.billing?.organizationName || '';
  drawBox(doc, 32, '32. SERVICE FACILITY LOCATION', facilityName);
  
  // Box 33 - Billing Provider
  const billingName = claimData.billing?.organizationName || 
                     `${claimData.billing?.firstName || ''} ${claimData.billing?.lastName || ''}`.trim();
  const billingNPI = claimData.billing?.npi || '';
  const billingAddress = claimData.billing?.address;
  const billingInfo = `${billingName}\n${billingAddress?.address1 || ''}\n${billingAddress?.city || ''}, ${billingAddress?.state || ''} ${billingAddress?.postalCode || ''}`;
  drawBox(doc, 33, '33. BILLING PROVIDER INFO', billingInfo);
  drawBox(doc, '33a', 'NPI', billingNPI);
  
  doc.end();
}

export function generateCMS1500PDF(claimData: ClaimSubmissionRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];
    try {
      writeCMS1500PDF(claimData, chunk => buffers.push(chunk), () => resolve(Buffer.concat(buffers)));
    } catch (err) {
      reject(err);
    }
  });
}


# ChangeHealth - Professional Claims & Eligibility Platform

A standalone prototype for eligibility verification and a constrained CMS-1500 professional-claim workflow using the Optum Medical Network APIs.

## 🏥 Features

### ✅ Eligibility Checker
- Real-time patient insurance eligibility verification
- Comprehensive eligibility response display with benefits information
- Payer lookup and directory search
- Sandbox and production environment support
- OAuth2 authentication with automatic token caching

### 📋 Professional Claims (CMS 1500)
- CMS-1500-aligned primary commercial claim form
- Support for up to 50 service lines per claim
- Automatic total charge calculation
- Claim validation and submission to Optum API
- Multiple diagnosis codes (up to 12 ICD-10 codes)
- Service line details with CPT/HCPCS codes, modifiers, diagnosis pointers, rendering providers, and CLIA references for QW lab lines
- Signature on file checkboxes for regulatory compliance

> **Prototype safety boundary:** This repository is a payload and interaction reference, not the production claims system. The backend has no employee authorization layer, claim payloads can be logged in plaintext, and form drafts are retained in browser local storage. Use only Optum canned sandbox data. Do not expose this service publicly, enter real PHI, or use its production submission path. The Novo implementation will add authorization, database-backed immutable attempts, audit history, PHI controls, and validation-before-submission enforcement.

### 🔄 Claims Status (Coming Soon)
- Real-time claim status tracking
- Claims history and search

### 📊 Claims Reconciliation (Coming Soon)
- Payment reconciliation
- ERA processing

## 🎨 Tech Stack

**Frontend:**
- React 19 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- Reperio Health brand colors (Purple: #9e32e2, Blue: #2a5cb2)
- Poppins font family

**Backend:**
- Node.js 18+ + Express
- TypeScript
- Docker + Docker Compose
- OAuth2 authentication with token caching
- RESTful API architecture

**APIs Integrated:**
- Optum Medical Network Enhanced Eligibility V3
- Optum Medical Network Professional Claims V3
- Optum Payer Lookup & Directory

## 📁 Project Structure

```
changehealth/
├── backend/
│   ├── src/
│   │   ├── server.ts                 # Express server (port 3001)
│   │   ├── routes/
│   │   │   ├── eligibility.ts        # Eligibility API routes
│   │   │   └── claims.ts             # Claims validation/submission routes
│   │   └── services/
│   │       ├── optum.ts              # Optum API service with OAuth2
│   │       ├── pdfGenerator.ts       # CMS 1500 PDF generation
│   │       └── types.ts              # TypeScript type definitions
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx                   # Main app with tab navigation
│   │   ├── components/
│   │   │   ├── EligibilityForm.tsx   # Patient eligibility form
│   │   │   ├── EligibilityDetails.tsx # Detailed eligibility response
│   │   │   ├── ClaimForm.tsx         # CMS 1500 claim form
│   │   │   ├── ClaimResponseDisplay.tsx # Claim validation/submission results
│   │   │   ├── TabNavigation.tsx     # Tab navigation component
│   │   │   └── EnvironmentSelector.tsx # Sandbox/Production toggle
│   │   ├── services/
│   │   │   ├── api.ts                # Eligibility API service
│   │   │   └── claimsApi.ts          # Claims API service
│   │   └── types/
│   │       ├── eligibility.ts        # Eligibility type definitions
│   │       └── claims.ts             # Claims type definitions
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
├── terraform/                        # EC2 infrastructure (Terraform)
│   ├── main.tf                       # Provider + S3 backend config
│   ├── variables.tf                  # Instance type, VPC, subnet, key pair
│   ├── data.tf                       # AMI, office/VPN IP lookups
│   ├── security.tf                   # Security group (office/VPN only)
│   ├── ec2.tf                        # EC2 instance + Elastic IP
│   ├── dns.tf                        # Route53 A record
│   └── outputs.tf                    # IP, URL, SSH command
├── docker-compose.yml
├── API_Requirements_Analysis.md      # Complete API requirements documentation
├── CMS1500_API_Field_Mapping.md      # Field-by-field API mapping guide
└── README.md
```

## 🌐 Deployment

The app runs on an EC2 instance in the staging VPC, managed by Terraform.

- **URL**: http://changehealth.reperiohealth.com
- **Backend API**: http://changehealth.reperiohealth.com:9001
- **Access**: Restricted to office and VPN IPs only
- **Instance**: t3.small (Amazon Linux 2023) running Docker Compose
- **Terraform state**: S3 bucket `reperio-infrastructure-terraform`, key `changehealth/terraform.tfstate`

### Infrastructure Management

```bash
cd terraform
terraform init
terraform plan    # Preview changes
terraform apply   # Apply changes
```

### Deploying Code Updates

```bash
ssh -i ~/.ssh/rh-matt.pem ec2-user@<elastic-ip>
cd /opt/changehealth
git pull origin main
docker compose up -d --build
```

### EC2 Environment Files

On the EC2 instance, two `.env` files provide production values (both gitignored):

**Root `.env`** (docker-compose overrides):
```
FRONTEND_PORT=80
VITE_API_BASE_URL=http://changehealth.reperiohealth.com:9001
```

**`backend/.env`** (Optum credentials):
```
OPTUM_SANDBOX_CLIENT_ID=<value>
OPTUM_SANDBOX_CLIENT_SECRET=<value>
OPTUM_PROD_ELIGIBILITY_CLIENT_ID=<value>
OPTUM_PROD_ELIGIBILITY_CLIENT_SECRET=<value>
OPTUM_PROD_PAYER_CLIENT_ID=<value>
OPTUM_PROD_PAYER_CLIENT_SECRET=<value>
PORT=3001
```

## 🚀 Local Development

### Prerequisites

- **Docker & Docker Compose**
- **Optum API credentials** for sandbox eligibility, production eligibility, and production payer-list APIs

### 1. Setup

Copy the example and add your credentials to `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

```env
OPTUM_SANDBOX_CLIENT_ID=your_sandbox_client_id
OPTUM_SANDBOX_CLIENT_SECRET=your_sandbox_client_secret
OPTUM_PROD_ELIGIBILITY_CLIENT_ID=your_production_eligibility_client_id
OPTUM_PROD_ELIGIBILITY_CLIENT_SECRET=your_production_eligibility_client_secret
OPTUM_PROD_PAYER_CLIENT_ID=your_production_payer_client_id
OPTUM_PROD_PAYER_CLIENT_SECRET=your_production_payer_client_secret
PORT=3001
```

Start everything:
```bash
docker compose up -d --build
```

- **Frontend**: http://localhost:9000
- **Backend API**: http://localhost:9001

No root `.env` is needed locally -- defaults in `docker-compose.yml` handle it.

### 2. Access the Application

Open your browser to **http://localhost:9000** and:
1. Select **Sandbox** or **Production** environment
2. Choose a tab:
   - **Eligibility Checker** - Verify patient insurance coverage
   - **Claim Form** - Submit CMS 1500 professional claims
   - **Claims Status** - Track claim processing (coming soon)
   - **Claims Reconciliation** - Manage payments (coming soon)

## 📋 Using the Eligibility Checker

### Required Fields
- **Trading Partner Service ID** - Payer identifier (e.g., UHC, CIGNA, AETNA)
- **Provider NPI** - National Provider Identifier
- **Provider Organization Name**
- **Member ID** - Patient's insurance member ID
- **Patient Name** - First and last name
- **Date of Birth** - Format: YYYY-MM-DD
- **Gender** - M (Male), F (Female), or U (Unknown)

### Optional Fields
- Group Number
- SSN

### Features
- **Payer Lookup** - Search payers by ID or name
- **Payer Directory** - Browse all available payers
- **Comprehensive Results** - View coverage details, copays, deductibles, benefit information
- **Preventive Care Filtering** - Highlights preventive care and annual wellness benefits

## 📄 Using the Claim Form (CMS 1500)

### Form Organization

The claim form follows CMS-1500 box order while intentionally supporting only new, primary commercial telehealth claims:

#### Patient & Insured Information (Boxes 1-11)
- **Box 1**: Commercial insurance (`CI`) only
- **Box 1a**: Patient member ID, sent on the subscriber for self coverage or the dependent otherwise
- **Boxes 2-5**: Patient demographics and address
- **Box 6**: Patient relationship to insured (Self, Spouse, Child, Other)
- **Boxes 4, 7**: Insured's name and address (auto-fills if relationship is "Self")
- **Boxes 9-9d**: Visible but disabled because secondary coverage is unsupported
- **Boxes 11-11d**: Primary subscriber details; 11b/11c are not applicable and 11d is always No

#### Signatures & Dates (Boxes 12-13)
- **Box 12**: Patient signature on file (checkbox)
- **Box 13**: Insured's signature on file (checkbox)
- Both pre-checked by default

#### Condition & Treatment Information (Boxes 14-23)
- **Boxes 10, 14-19**: Visible but disabled; conditional, accident, hospitalization, and referral workflows are unsupported
- **Box 20**: Always No
- **Box 21**: Up to 12 editable ICD-10 diagnoses (A-L), with the first five workflow defaults pre-populated
- **Box 22**: Always `1` (new claim)
- **Box 23**: Visible but disabled; prior authorization is unsupported

#### Service Lines (Box 24)
Add up to 50 service lines with:
- **24A**: One shared date of service; changing any line updates every line
- **24B**: Place of service `10` (telehealth in the patient's home)
- **24C**: Always non-emergency
- **24D**: CPT/HCPCS procedure code + modifier (dropdown)
- **24E**: Editable A-L diagnosis pointers
- **24F**: Charges (USD, auto-formatted)
- **24G**: Days/Units
- **24H**: EPSDT (Early Periodic Screening)
- **24I**: ID Qualifier (NPI - preselected)
- **24J**: Rendering provider NPI and name, required outside Optum's canned sandbox fixture
- **QW lab lines**: CLIA X4 service-line reference, defaulted to the prototype certificate number outside sandbox

#### Charge Summary (Boxes 25-29)
- **Box 25**: Federal Tax ID (EIN only)
- **Box 26**: Provider-assigned patient control number (`RC-` plus 12 digits outside sandbox)
- **Box 27**: Assignment accepted
- **Box 28**: **Total charge** (auto-calculated from service lines) - READ-ONLY
- **Box 29**: Amount paid by patient, fixed at `$0.00`

#### Provider Information (Boxes 31-33)
- **Box 31**: Physician signature on file plus a required signature date retained by the prototype
- **Box 32**: Required service facility organization, address, and NPI
- **Box 33**: Mirrors the Box 32 organization/NPI, uses the fixed Reperio billing address, and exposes read-only Claims Support contact metadata; the CMS telephone field is not applicable

### Form Features

✅ **Auto-population**:
- Box 1: Commercial insurance (`CI`)
- Box 12, 13, 31: "Signature on file" pre-checked
- Box 20: "No" (outside lab)
- Box 21: Five default diagnoses
- Box 22: New claim
- Box 24B: Place of service "10" for every line
- Box 25: EIN
- Box 27: Assignment accepted
- Box 28: Auto-calculated from service lines
- Box 29: `$0.00`

✅ **Smart Fields**:
- If "Self" selected in Box 6, patient info auto-fills insured fields (Boxes 4, 7)
- Auto-format phone numbers (XXX-XXX-XXXX)
- Auto-format currency fields (right-to-left with decimals)
- State dropdowns for all address fields
- EIN, NPI, patient-control-number, diagnosis-pointer, and total validation
- Sandbox fixture is isolated from production-like defaults

✅ **Dynamic Diagnosis Pointers**:
- Box 24E accepts up to four A-L pointers and validates them against populated Box 21 positions
- Additional service lines can be added for diagnoses beyond the defaults

✅ **Tooltips**:
- Hover over ⓘ icons in Box 24 for field descriptions

### Actions

1. **Validate Claim** - Check claim data against API requirements without submitting
2. **Submit Claim** - Exercise the selected Optum submission endpoint; this prototype is approved only for the canned sandbox workflow
3. **Generate PDF** - Create downloadable CMS 1500 PDF with form data

### Sandbox Test Data

When in **Sandbox mode**, the form can use test data for validation:
- Trading Partner Service ID: `9496`
- Payer: `EXTRA HEALTHY INSURANCE`
- The Load Default Data action supplies Optum's canned patient, billing, service-facility, submitter, and control-number values
- Canned sandbox success verifies authentication, transport, and serialization; it does not establish payer adjudication or clinical correctness

## 🔑 API Credentials

Credentials are configured only through `backend/.env`; the UI does not accept or store API credentials.

```env
OPTUM_SANDBOX_CLIENT_ID=your_sandbox_client_id
OPTUM_SANDBOX_CLIENT_SECRET=your_sandbox_client_secret
OPTUM_PROD_ELIGIBILITY_CLIENT_ID=your_production_eligibility_client_id
OPTUM_PROD_ELIGIBILITY_CLIENT_SECRET=your_production_eligibility_client_secret
OPTUM_PROD_PAYER_CLIENT_ID=your_production_payer_client_id
OPTUM_PROD_PAYER_CLIENT_SECRET=your_production_payer_client_secret
PORT=3001
```

Credential selection is based on the environment sent by the frontend:

- Sandbox eligibility and professional claims use `OPTUM_SANDBOX_CLIENT_ID` and `OPTUM_SANDBOX_CLIENT_SECRET`.
- Production eligibility and professional claims use `OPTUM_PROD_ELIGIBILITY_CLIENT_ID` and `OPTUM_PROD_ELIGIBILITY_CLIENT_SECRET`.
- Payer lookup, directory, and export operations always use `OPTUM_PROD_PAYER_CLIENT_ID` and `OPTUM_PROD_PAYER_CLIENT_SECRET` against the production payer-list endpoint.
- The UI defaults to Sandbox and stores the selected environment in browser local storage. There is no `OPTUM_ENV` backend variable.

## 📡 API Endpoints

### Backend (Port 3001, exposed as 9001)

#### Eligibility
- **POST** `/api/eligibility/check-eligibility` - Check patient eligibility
- **POST** `/api/eligibility/get-all-payers` - Get all available payers
- **POST** `/api/eligibility/lookup-payer` - Lookup specific payer details
- **POST** `/api/eligibility/export-payers` - Export the payer directory

#### Claims
- **POST** `/api/claims/validate` - Validate claim data
- **POST** `/api/claims/submit` - Submit claim for processing
- **POST** `/api/claims/generate-pdf` - Generate CMS 1500 PDF

## 📚 Documentation

### API Requirements & Field Mapping

Two historical analysis documents are included to explain how the original API mapping was derived. They predate the completed limited-workflow prototype; use the Claim Form implementation and this README for current behavior.

#### 1. **API_Requirements_Analysis.md**
Complete analysis of what the Professional Claims V3 API requires:
- ✅ All required fields with "Required" column
- ✅ CMS 1500 box numbers for each field
- ✅ Missing critical fields identification
- ✅ Optional but recommended fields
- ✅ Implementation priority guide

The gaps recorded in that analysis—such as submitter, receiver, and Box 22 wiring—have been addressed for the supported new-primary-commercial workflow. Items describing secondary or conditional claims remain intentionally out of scope rather than pending prototype work.

#### 2. **CMS1500_API_Field_Mapping.md**
Field-by-field mapping between CMS 1500 form and API:
- ✅ Comprehensive mapping tables
- ✅ Data transformation notes (dates, currency, phones)
- ✅ X12 EDI segment references
- ✅ Valid values for coded fields
- ✅ Discrepancies between form and API

## 🛠️ Development (without Docker)

```bash
# Backend (terminal 1; reads backend/.env and runs on port 3001)
cd backend && npm install && npm run dev

# Frontend (terminal 2; runs on port 5173 and targets the native backend)
cd frontend && npm install
VITE_API_BASE_URL=http://localhost:3001 npm run dev
```

## ⚙️ Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3002` in code | Backend server port; set to `3001` for Docker Compose |
| `OPTUM_SANDBOX_CLIENT_ID` | - | Client ID for sandbox eligibility and claims |
| `OPTUM_SANDBOX_CLIENT_SECRET` | - | Client secret for sandbox eligibility and claims |
| `OPTUM_PROD_ELIGIBILITY_CLIENT_ID` | - | Client ID for production eligibility and claims |
| `OPTUM_PROD_ELIGIBILITY_CLIENT_SECRET` | - | Client secret for production eligibility and claims |
| `OPTUM_PROD_PAYER_CLIENT_ID` | - | Client ID for production payer-list operations |
| `OPTUM_PROD_PAYER_CLIENT_SECRET` | - | Client secret for production payer-list operations |

### Docker Compose (root `.env`, only needed on EC2)

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_PORT` | `9000` | Host port for frontend (80 on EC2) |
| `VITE_API_BASE_URL` | `http://localhost:9001` | Backend API URL for browser requests |

## 🐛 Troubleshooting

### Backend Issues

**Docker container not starting:**
```bash
docker compose ps
docker compose logs backend
docker compose restart backend
```

### Frontend Issues

**Can't connect to backend:**
- Verify backend is running: `curl http://localhost:9001`
- Check browser console for CORS errors

**Build errors:**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### API Issues

**OAuth2 token errors:**
- Verify credentials are correct for the selected environment
- Check Optum sandbox/production access is enabled
- Token cached for ~1 hour, may need to wait or clear cache

**Validation errors:**
- Check API_Requirements_Analysis.md for required fields
- Ensure date formats are CCYYMMDD (8 digits)
- Verify NPI is 10 digits
- Check diagnosis codes are valid ICD-10 codes

**"Failed to fetch" errors:**
- Backend may not be running (start with `docker compose up -d`)
- Check network connectivity
- Verify API endpoints are accessible

## 🔮 Roadmap

### Prototype Baseline
- [x] Add Optum submitter, receiver, payer-routing, billing, and service-facility fields
- [x] Support new primary commercial claims with manual payer ID/name entry
- [x] Connect CMS-1500 diagnoses, service lines, totals, rendering providers, and QW-line CLIA references to the request
- [x] Display validation/submission request details and Optum clearinghouse tracking number

### Near Term
- [ ] Build the production claims workflow in Novo with employee claims authorization
- [ ] Persist claim drafts, immutable attempts, validation responses, and submission responses
- [ ] Derive claim data from signed visits, eligibility snapshots, CPT rates, and state/federal practice records
- [ ] Implement claims status and reconciliation flows

Secondary, corrected, accident, employment, hospitalization, referral, prior-authorization, and other conditional claim workflows are intentionally outside the supported Reperio telehealth scope.

## 📄 License

ISC

## 🤝 Contributing

This is a Reperio Health internal project. For questions or issues, contact the development team.

---

**Built with ❤️ by Reperio Health**

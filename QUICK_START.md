# Quick Start Guide

## Getting Started in 5 Minutes

### 1. Configure the backend

From the project root, copy the tracked example:

```bash
cp backend/.env.example backend/.env
```

Add your Optum credentials to `backend/.env`:

```env
OPTUM_SANDBOX_CLIENT_ID=your_sandbox_client_id
OPTUM_SANDBOX_CLIENT_SECRET=your_sandbox_client_secret
OPTUM_PROD_ELIGIBILITY_CLIENT_ID=your_production_eligibility_client_id
OPTUM_PROD_ELIGIBILITY_CLIENT_SECRET=your_production_eligibility_client_secret
OPTUM_PROD_PAYER_CLIENT_ID=your_production_payer_client_id
OPTUM_PROD_PAYER_CLIENT_SECRET=your_production_payer_client_secret
PORT=3001
```

The UI defaults to the sandbox environment. Payer lookup and directory requests always use the production payer endpoint and production payer credentials, regardless of the environment selected in the UI.

### 2. Start the application

Docker Compose starts both the backend and frontend:

```bash
docker compose up -d --build
```

- Frontend: **http://localhost:9000**
- Backend API: **http://localhost:9001**

### 3. Open your browser

Navigate to **http://localhost:9000**. Choose Sandbox or Production with the environment selector in the UI. Credentials are read by the backend from `backend/.env`; they cannot be entered in the UI.

### 4. Fill out the form

**Required Fields:**
- **Payer ID**: e.g., `CIGNA`, `AETNA`, `ANTHM`
- **Provider Name**: e.g., `Example Medical Center`
- **Provider NPI**: 10-digit number, e.g., `1234567890`
- **Member ID**: Patient's insurance member ID
- **First Name**: Patient's first name
- **Last Name**: Patient's last name
- **Date of Birth**: Patient's DOB
- **Gender**: M or F

**Optional Fields:**
- Group Number
- SSN

### 5. Submit

Click "Check Eligibility" and wait for the response!

## Example Test Data

```
Payer ID: CIGNA
Provider Organization: Test Medical Center
Provider NPI: 1234567890
Member ID: W123456789
First Name: John
Last Name: Doe
Date of Birth: 1980-01-02
Gender: Male
Group Number: GRP5000
```

## Troubleshooting

**Backend not responding?**
```bash
# Check if Docker container is running
docker ps

# Check logs
docker compose logs -f backend
```

**Frontend can't connect?**
```bash
# Verify both containers are running
docker compose ps
```

**Need to rebuild?**
```bash
docker compose down
docker compose up -d --build
```

## Stopping the Application

```bash
docker compose down
```

## Next Steps

- Review the full [README.md](./README.md) for detailed documentation
- Add more fields as needed for your use case

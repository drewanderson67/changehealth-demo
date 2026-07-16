# Runtime Configuration

This file describes the checked-in runtime configuration. It does not indicate whether a particular local or deployed instance is currently running.

## Docker Compose

- Frontend URL: `http://localhost:9000`
- Backend API: `http://localhost:9001`
- Backend container port: `3001`
- Frontend container port: `5173`
- Backend logs: `docker compose logs -f backend`
- Frontend logs: `docker compose logs -f frontend`

## Environments and Credentials

Configure credentials in `backend/.env`:

```env
OPTUM_SANDBOX_CLIENT_ID=your_sandbox_client_id
OPTUM_SANDBOX_CLIENT_SECRET=your_sandbox_client_secret
OPTUM_PROD_ELIGIBILITY_CLIENT_ID=your_production_eligibility_client_id
OPTUM_PROD_ELIGIBILITY_CLIENT_SECRET=your_production_eligibility_client_secret
OPTUM_PROD_PAYER_CLIENT_ID=your_production_payer_client_id
OPTUM_PROD_PAYER_CLIENT_SECRET=your_production_payer_client_secret
PORT=3001
```

The frontend environment selector controls whether eligibility and professional claims requests use the sandbox or production Optum API. It defaults to Sandbox and persists the selection in browser local storage. The backend does not read an `OPTUM_ENV` variable.

Payer lookup, directory, and export requests always use the production payer-list API and the `OPTUM_PROD_PAYER_*` credentials.

## Testing the Application

### 1. View in Browser
Open http://localhost:9000 after starting Docker Compose.

### 2. Select an Environment

Use the environment selector in the UI. Credentials must already be present in `backend/.env`.

### 3. Fill Form
- Payer ID: e.g., CIGNA, AETNA, ANTHM
- Provider Name: Your organization name
- Provider NPI: 10-digit NPI
- Patient Member ID: Real member ID
- Patient demographics: First name, last name, DOB, gender
- Optional: Group number, SSN

### 4. Submit
Click "Check Eligibility". The request uses the environment selected in the UI.

## Important Notes

⚠️ **Professional-claim operating policy (not application-enforced): use this prototype only with Optum's canned sandbox workflow.** The environment selector can route claims to production, so operators are responsible for keeping Sandbox selected.
- The claims backend has no employee authorization layer.
- Claim and eligibility request payloads may appear in local backend logs.
- Claim drafts are retained in browser local storage.
- Do not enter real claim PHI, expose the service publicly, or use the production claim-submission path.
- Use Optum's canned fixture via **Load Optum Sandbox Data** for claim verification.

Production eligibility behavior predates the claims prototype and is outside the claim-form reference scope. Any live eligibility use still requires approved production credentials, an appropriately controlled deployment, and the team's normal PHI safeguards.

To switch environments, use the selector in the UI. No backend restart is required.

## Monitoring

### Check Backend Logs
```bash
docker compose logs -f backend
```

### Check Frontend Logs
```bash
docker compose logs -f frontend
```

### Verify Backend Health
```bash
docker compose ps
```

## Quick Commands

**Stop everything:**
```bash
docker compose down
```

**Restart backend:**
```bash
docker compose restart backend
```

**Restart frontend:**
```bash
docker compose restart frontend
```

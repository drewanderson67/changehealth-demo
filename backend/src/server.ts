import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import eligibilityRoutes from './routes/eligibility';
import claimsRoutes from './routes/claims';
import { isMockMode } from './services/mockOptum';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.get('/api/status', (_req, res) => res.json({ mock: isMockMode() }));
app.use('/api/eligibility', eligibilityRoutes);
app.use('/api/claims', claimsRoutes);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Server on port ${PORT}`);
  if (isMockMode()) console.log('OPTUM MOCK MODE: returning simulated Optum responses (no credentials used)');
});


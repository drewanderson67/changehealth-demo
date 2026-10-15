import express from 'express';
import { validateClaim, submitClaim } from '../services/optum';
import { generateCMS1500PDF } from '../services/pdfGenerator';

const router = express.Router();

router.post('/validate', async (req, res, next) => {
  try {
    const { claimData, environment } = req.body;

    if (!claimData) {
      return res.status(400).json({ message: 'claimData is required' });
    }

    console.log('Received claim validation request');
    console.log('Environment:', environment || 'production (default)');
    console.log('Request payload:', JSON.stringify(claimData, null, 2));

    const result = await validateClaim(claimData, environment);
    console.log('✅ Claim validation completed successfully');
    res.json(result);
  } catch (error: any) {
    console.error('Claim validation failed:');
    console.error('Error message:', error.message);
    console.error('Status:', error.response?.status);
    console.error('Response data:', JSON.stringify(error.response?.data, null, 2));

    res.status(error.response?.status || 500).json({
      message: error.message,
      details: error.response?.data,
      statusCode: error.response?.status
    });
  }
});

router.post('/submit', async (req, res, next) => {
  try {
    const { claimData, environment } = req.body;

    if (!claimData) {
      return res.status(400).json({ message: 'claimData is required' });
    }

    console.log('Received claim submission request');
    console.log('Environment:', environment || 'production (default)');
    console.log('Request payload:', JSON.stringify(claimData, null, 2));

    const result = await submitClaim(claimData, environment);
    console.log('✅ Claim submission completed successfully');
    res.json(result);
  } catch (error: any) {
    console.error('Claim submission failed:');
    console.error('Error message:', error.message);
    console.error('Status:', error.response?.status);
    console.error('Response data:', JSON.stringify(error.response?.data, null, 2));

    res.status(error.response?.status || 500).json({
      message: error.message,
      details: error.response?.data,
      statusCode: error.response?.status
    });
  }
});

router.post('/generate-pdf', async (req, res, next) => {
  try {
    const { claimData } = req.body;

    if (!claimData) {
      return res.status(400).json({ message: 'claimData is required' });
    }

    console.log('Generating CMS 1500 PDF...');

    const pdfBuffer = await generateCMS1500PDF(claimData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=cms-1500-claim.pdf');
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('PDF generation failed:');
    console.error('Error message:', error.message);
    console.error('Stack:', error.stack);

    res.status(500).json({
      message: error.message,
      details: 'Failed to generate CMS 1500 PDF'
    });
  }
});

export default router;

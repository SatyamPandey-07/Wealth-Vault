import express from 'express';
import { protect } from '../middleware/auth.js';
import interlockService from '../services/interlockService.js';
import { enforceInterlockSafety } from '../middleware/interlockGuard.js';
import { ApiResponse } from '../utils/ApiResponse.js';

const router = express.Router();

// Get network analysis for all vaults
router.get('/analysis', protect, async (req, res) => {
    try {
        const analysis = await interlockService.getNetworkAnalysis(req.user.id);
        res.status(200).json(new ApiResponse(200, analysis, 'Network analysis retrieved successfully'));
    } catch (error) {
        res.status(500).json(new ApiResponse(500, null, error.message));
    }
});

// Get opportunity cost analysis
router.get('/opportunity-cost', protect, async (req, res) => {
    try {
        const analysis = await interlockService.getOpportunityCostAnalysis(req.user.id);
        res.status(200).json(new ApiResponse(200, analysis, 'Opportunity cost analysis retrieved successfully'));
    } catch (error) {
        res.status(500).json(new ApiResponse(500, null, error.message));
    }
});

// Initiate an internal loan
router.post('/loans', protect, enforceInterlockSafety(100), async (req, res) => {
    const {
        lenderVaultId, borrowerVaultId, amount, interestRate,
        rateType = 'fixed', indexSource, interestSpread = 0
    } = req.body;

    try {
        const loan = await interlockService.initiateInternalLoan(
            req.user.id,
            lenderVaultId,
            borrowerVaultId,
            parseFloat(amount),
            parseFloat(interestRate),
            rateType,
            indexSource,
            parseFloat(interestSpread)
        );
        res.status(201).json(new ApiResponse(201, loan, 'Internal loan initiated successfully'));
    } catch (error) {
        res.status(400).json(new ApiResponse(400, null, error.message));
    }
});

// Repay an internal loan
router.post('/loans/:loanId/repay', protect, async (req, res) => {
    const { amount } = req.body;
    const { loanId } = req.params;

    try {
        const repayment = await interlockService.recordRepayment(req.user.id, loanId, parseFloat(amount));
        res.status(200).json(new ApiResponse(200, repayment, 'Repayment recorded successfully'));
    } catch (error) {
        res.status(400).json(new ApiResponse(400, null, error.message));
    }
});

// Get D3-compatible network topology (#465)
router.get('/topology', protect, async (req, res) => {
    try {
        const topology = await interlockService.getTopology(req.user.id);
        res.status(200).json(new ApiResponse(200, topology, 'Network topology retrieved successfully'));
    } catch (error) {
        res.status(500).json(new ApiResponse(500, null, error.message));
    }
});

// Run a predictive cascade stress test (#465)
router.post('/stress-test', protect, async (req, res) => {
    const { targetVaultId, shockPercentage } = req.body;
    try {
        const results = await interlockService.runStressTest(req.user.id, targetVaultId, parseFloat(shockPercentage));
        res.status(200).json(new ApiResponse(200, results, 'Stress test completed successfully'));
    } catch (error) {
        res.status(500).json(new ApiResponse(500, null, error.message));
    }
});

export default router;

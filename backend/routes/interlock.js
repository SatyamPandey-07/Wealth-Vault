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

// Initiate an internal loan
// Applying interlock safety to ensure lender doesn't become insolvent
router.post('/loans', protect, enforceInterlockSafety(100), async (req, res) => {
    const { lenderVaultId, borrowerVaultId, amount, interestRate } = req.body;

    try {
        const loan = await interlockService.initiateInternalLoan(
            req.user.id,
            lenderVaultId,
            borrowerVaultId,
            parseFloat(amount),
            parseFloat(interestRate)
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

export default router;

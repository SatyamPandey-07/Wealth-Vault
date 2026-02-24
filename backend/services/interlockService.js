import db from '../config/db.js';
import { internalDebts, vaultBalances, ledgerEntries, ledgerAccounts } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { NetWorthGraph } from '../utils/netWorthGraph.js';

/**
 * Service to manage internal vault-to-vault lending and interlocking network.
 */
class InterlockService {
    /**
     * Creates an internal loan between two vaults.
     */
    async initiateInternalLoan(userId, lenderVaultId, borrowerVaultId, amount, interestRate) {
        return await db.transaction(async (tx) => {
            // 1. Verify lender has sufficient cash balance
            const lenderBalance = await tx.select().from(vaultBalances)
                .where(and(eq(vaultBalances.vaultId, lenderVaultId), eq(vaultBalances.userId, userId)));

            const totalCash = lenderBalance.reduce((acc, b) => acc + parseFloat(b.balance), 0);
            if (totalCash < amount) {
                throw new Error('Insufficient cash in lender vault for internal loan.');
            }

            // 2. Insert internal debt record
            const [loan] = await tx.insert(internalDebts).values({
                userId,
                lenderVaultId,
                borrowerVaultId,
                principalAmount: amount.toFixed(8),
                currentBalance: amount.toFixed(8),
                interestRate: interestRate.toFixed(2),
                status: 'active',
                lastAccrualDate: new Date()
            }).returning();

            // 3. Update vault balances (Transfer cash from lender to borrower)
            // Note: We assume single currency (USD) for simplicity in this module, 
            // or we could expand to handle specific currency rows.

            // Deduct from lender
            await tx.update(vaultBalances)
                .set({ balance: sql`balance - ${amount.toFixed(8)}` })
                .where(and(eq(vaultBalances.vaultId, lenderVaultId), eq(vaultBalances.userId, userId)));

            // Add to borrower
            await tx.update(vaultBalances)
                .set({ balance: sql`balance + ${amount.toFixed(8)}` })
                .where(and(eq(vaultBalances.vaultId, borrowerVaultId), eq(vaultBalances.userId, userId)));

            return loan;
        });
    }

    /**
     * Records a repayment for an internal loan.
     */
    async recordRepayment(userId, loanId, amount) {
        return await db.transaction(async (tx) => {
            const [loan] = await tx.select().from(internalDebts).where(eq(internalDebts.id, loanId));
            if (!loan || loan.userId !== userId) throw new Error('Loan not found.');

            // Transfer cash back
            await tx.update(vaultBalances)
                .set({ balance: sql`balance - ${amount.toFixed(8)}` })
                .where(and(eq(vaultBalances.vaultId, loan.borrowerVaultId), eq(vaultBalances.userId, userId)));

            await tx.update(vaultBalances)
                .set({ balance: sql`balance + ${amount.toFixed(8)}` })
                .where(and(eq(vaultBalances.vaultId, loan.lenderVaultId), eq(vaultBalances.userId, userId)));

            // Update loan balance
            const newBalance = parseFloat(loan.currentBalance) - amount;
            const status = newBalance <= 0 ? 'repaid' : 'active';

            const [updatedLoan] = await tx.update(internalDebts)
                .set({
                    currentBalance: Math.max(0, newBalance).toFixed(8),
                    status,
                    updatedAt: new Date()
                })
                .where(eq(internalDebts.id, loanId))
                .returning();

            return updatedLoan;
        });
    }

    /**
     * Gets recursive net worth analysis for a user.
     */
    async getNetworkAnalysis(userId) {
        const graph = new NetWorthGraph(userId);
        await graph.build();
        return {
            summary: graph.getAllVaultsSummary(),
            cycles: graph.detectCycles()
        };
    }
}

export default new InterlockService();

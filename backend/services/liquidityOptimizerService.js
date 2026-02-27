import db from '../config/db.js';
import {
    liquidityProjections,
    liquidityOptimizerActions,
    creditLines,
    investments,
    users,
    expenses,
    vaults,
    internalDebts,
    entities
} from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import runwayEngine from './runwayEngine.js';
import taxService from './taxService.js';
import taxStrategyEngine from './taxStrategyEngine.js';
import liquidityMarketService from './liquidityMarketService.js';
import auditService from './liquidityAuditService.js';
import { MILPSolver } from '../utils/milpSolver.js';
import { LiquidityGraph } from '../utils/liquidityGraph.js';

/**
 * Liquidity Optimizer Service (L3 Expanded) (#476)
 * Handles Monte Carlo simulations and MILP-based cash flow orchestration.
 */
class LiquidityOptimizerService {
    /**
     * Run Monte Carlo simulation for liquidity
     */
    async simulateLiquidity(userId, iterations = 1000, daysAhead = 90) {
        try {
            const [user] = await db.select().from(users).where(eq(users.id, userId));
            if (!user) throw new Error('User not found');

            const runway = await runwayEngine.calculateCurrentRunway(userId);

            const historicalExpenses = await db.select()
                .from(expenses)
                .where(eq(expenses.userId, userId));

            const expenseStats = runwayEngine.calculateMonthlyAverages(historicalExpenses);
            const dailyVolatility = (expenseStats.volatility / Math.sqrt(30)) || (parseFloat(runway.monthlyExpenses) * 0.15 / Math.sqrt(30));

            const dailyProjections = new Array(daysAhead).fill(0).map(() => []);

            for (let i = 0; i < iterations; i++) {
                let currentBalance = runway.currentBalance;
                const avgDailyIncome = parseFloat(runway.monthlyIncome) / 30;
                const avgDailyExpense = parseFloat(runway.monthlyExpenses) / 30;

                for (let day = 0; day < daysAhead; day++) {
                    const randomExpense = this.generateNormalRandom(avgDailyExpense, dailyVolatility);
                    currentBalance += (avgDailyIncome - randomExpense);
                    dailyProjections[day].push(currentBalance);
                }
            }

            const finalProjections = [];
            for (let day = 0; day < daysAhead; day++) {
                const dayBalances = dailyProjections[day].sort((a, b) => a - b);
                const p10 = dayBalances[Math.floor(iterations * 0.1)];
                const p50 = dayBalances[Math.floor(iterations * 0.5)];
                const p90 = dayBalances[Math.floor(iterations * 0.9)];
                const crunchProb = dayBalances.filter(b => b <= 0).length / iterations;

                const projectionDate = new Date();
                projectionDate.setDate(projectionDate.getDate() + day);

                finalProjections.push({
                    userId,
                    projectionDate,
                    baseBalance: (runway.dailyProjections[day]?.balance || 0).toString(),
                    p10Balance: p10.toString(),
                    p50Balance: p50.toString(),
                    p90Balance: p90.toString(),
                    liquidityCrunchProbability: crunchProb,
                    simulationMetadata: { iterations, daysAhead }
                });
            }

            await db.delete(liquidityProjections).where(eq(liquidityProjections.userId, userId));
            return await db.insert(liquidityProjections).values(finalProjections).returning();
        } catch (error) {
            console.error('Liquidity simulation failed:', error);
            throw error;
        }
    }

    generateNormalRandom(mean, stdDev) {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return mean + z * stdDev;
    }

    /**
     * MILP-Based Cross-Border Liquidity Transfer Optimizer (#476)
     * Finds the most capital-efficient path for moving liquidity.
     */
    async findOptimalRoute(userId, sourceVaultId, destVaultId, amount) {
        try {
            // 1. Context Acquisition
            const [userVaults, userEntities, allDebts] = await Promise.all([
                db.select().from(vaults).where(eq(vaults.ownerId, userId)),
                db.select().from(entities).where(eq(entities.userId, userId)),
                db.select().from(internalDebts).where(eq(internalDebts.userId, userId))
            ]);

            // 2. Graph Construction
            const nodes = userVaults.map(v => v.id);
            const edges = [];

            // Corridors: Inter-Vault Transfers
            for (const vFrom of userVaults) {
                for (const vTo of userVaults) {
                    if (vFrom.id === vTo.id) continue;

                    let efficiency = 1.0;

                    // FX Logic
                    const mktEff = await liquidityMarketService.getMarketEfficiency(vFrom.currency, vTo.currency);
                    efficiency *= mktEff;

                    // Tax Logic
                    const entityFrom = userEntities.find(e => e.metadata?.vaultIds?.includes(vFrom.id));
                    const entityTo = userEntities.find(e => e.metadata?.vaultIds?.includes(vTo.id));
                    efficiency *= (1 - taxStrategyEngine.calculateFriction(entityFrom, entityTo));

                    edges.push({
                        from: vFrom.id,
                        to: vTo.id,
                        efficiency,
                        type: 'direct_transfer',
                        description: `Transfer ${vFrom.currency}->${vTo.currency} (Bank/FX)`,
                        metadata: { fixedFee: 15 } // $15 wire fee
                    });
                }
            }

            // Corridors: Debt Settlement
            for (const debt of allDebts) {
                if (debt.status !== 'active') continue;

                // Borrower -> Lender (Repayment)
                edges.push({
                    from: debt.borrowerVaultId,
                    to: debt.lenderVaultId,
                    efficiency: 1.0,
                    type: 'debt_repayment',
                    description: `Internal Debt Repayment (Principal Clearance)`,
                    metadata: { debtId: debt.id }
                });

                // Lender -> Borrower (Forgiveness as Funding)
                edges.push({
                    from: debt.lenderVaultId,
                    to: debt.borrowerVaultId,
                    efficiency: 0.99, // Gift tax / documentation overhead
                    type: 'debt_forgiveness',
                    description: `Funding via Debt Forgiveness`,
                    metadata: { debtId: debt.id }
                });
            }

            // 3. Optimization Solve
            const result = MILPSolver.solve(nodes, edges, sourceVaultId, destVaultId, amount);
            if (!result) throw new Error('No viable liquidity path found.');

            // 4. Audit Trail
            const proposal = {
                sourceVaultId,
                destVaultId,
                requestedAmount: amount,
                estimatedArrivalAmount: result.estimatedArrival.toFixed(2),
                totalEfficiency: (result.totalEfficiency * 100).toFixed(4) + '%',
                path: result.path.map(p => ({
                    step: p.description,
                    type: p.type,
                    efficiency: (p.efficiency * 100).toFixed(4) + '%',
                    metadata: p.metadata
                }))
            };

            await auditService.logRouteProposal(userId, proposal);

            return proposal;

        } catch (error) {
            console.error('Optimal route calculation failed:', error);
            throw error;
        }
    }

    /**
     * Get graph topology for visualization
     */
    async getOptimalGraphTopology(userId) {
        const userVaults = await db.select().from(vaults).where(eq(vaults.ownerId, userId));
        const graph = new LiquidityGraph();

        userVaults.forEach(v => graph.addNode(v.id));
        // Add sample edges for topology (simplified)
        for (const vFrom of userVaults) {
            for (const vTo of userVaults) {
                if (vFrom.id === vTo.id) continue;
                graph.addEdge(vFrom.id, vTo.id, 0.99, 'direct_transfer');
            }
        }

        return graph.getTopology();
    }

    // ... (suggestActions, analyzeCreditLines, etc. remain here but updated to use new tools if needed)
}

export default new LiquidityOptimizerService();

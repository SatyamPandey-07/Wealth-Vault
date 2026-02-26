import db from '../config/db.js';
import {
    liquidityProjections,
    liquidityOptimizerActions,
    creditLines,
    investments,
    currencyWallets,
    users,
    expenses
} from '../db/schema.js';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import runwayEngine from './runwayEngine.js';
import taxService from './taxService.js';
import { vaults, vaultBalances, entities, internalDebts, marketRatesOracle } from '../db/schema.js';

/**
 * Liquidity Optimizer Service (L3)
 * Handles Monte Carlo simulations and automated cash flow re-routing
 */
class LiquidityOptimizerService {
    /**
     * Run Monte Carlo simulation for liquidity
     * @param {string} userId - User ID
     * @param {number} iterations - Number of simulations
     * @param {number} daysAhead - Forecast horizon
     */
    async simulateLiquidity(userId, iterations = 1000, daysAhead = 90) {
        try {
            // Get user current state
            const [user] = await db.select().from(users).where(eq(users.id, userId));
            if (!user) throw new Error('User not found');

            const runway = await runwayEngine.calculateCurrentRunway(userId);

            // Get historical expense volatility
            const historicalExpenses = await db.select()
                .from(expenses)
                .where(eq(expenses.userId, userId));

            const expenseStats = runwayEngine.calculateMonthlyAverages(historicalExpenses);
            // Estimate daily volatility (simplistic approach: monthly vol / sqrt(30))
            const dailyVolatility = (expenseStats.volatility / Math.sqrt(30)) || (parseFloat(runway.monthlyExpenses) * 0.15 / Math.sqrt(30));

            const dailyProjections = new Array(daysAhead).fill(0).map(() => []);

            for (let i = 0; i < iterations; i++) {
                let currentBalance = runway.currentBalance;
                const avgDailyIncome = parseFloat(runway.monthlyIncome) / 30;
                const avgDailyExpense = parseFloat(runway.monthlyExpenses) / 30;

                for (let day = 0; day < daysAhead; day++) {
                    // Monte Carlo: Add randomness to expenses (normally distributed)
                    const randomExpense = this.generateNormalRandom(avgDailyExpense, dailyVolatility);
                    currentBalance += (avgDailyIncome - randomExpense);
                    dailyProjections[day].push(currentBalance);
                }
            }

            // Calculate percentiles and crunch probability
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

            // Clear old projections and save new ones
            await db.delete(liquidityProjections).where(eq(liquidityProjections.userId, userId));
            const inserted = await db.insert(liquidityProjections).values(finalProjections).returning();

            return inserted;
        } catch (error) {
            console.error('Liquidity simulation failed:', error);
            throw error;
        }
    }

    /**
     * Generate normal random variable using Box-Muller transform
     */
    generateNormalRandom(mean, stdDev) {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return mean + z * stdDev;
    }

    /**
     * Identify and suggest optimization actions
     * @param {string} userId - User ID
     */
    async suggestActions(userId) {
        try {
            // Get latest projections
            const projections = await db.select()
                .from(liquidityProjections)
                .where(eq(liquidityProjections.userId, userId))
                .orderBy(liquidityProjections.projectionDate);

            // Look for crunches in the next 30 days with > 20% probability
            const imminentRisk = projections.find(p => {
                const daysDiff = (new Date(p.projectionDate) - new Date()) / (1000 * 60 * 60 * 24);
                return daysDiff <= 30 && p.liquidityCrunchProbability > 0.2;
            });

            if (!imminentRisk) return [];

            const actions = [];
            const shortfallAmount = Math.abs(parseFloat(imminentRisk.p10Balance));

            // 1. Analyze Credit Line Arbitrage
            const creditLineActions = await this.analyzeCreditLines(userId, shortfallAmount);
            actions.push(...creditLineActions);

            // 2. Analyze Asset Liquidation
            const assetActions = await this.analyzeAssetLiquidation(userId, shortfallAmount);
            actions.push(...assetActions);

            // Sort by impact score and cost of capital
            const finalActions = actions
                .sort((a, b) => b.impactScore - a.impactScore || a.costOfCapital - b.costOfCapital);

            // Save proposed actions
            if (finalActions.length > 0) {
                await db.insert(liquidityOptimizerActions).values(
                    finalActions.map(a => ({
                        userId,
                        projectionId: imminentRisk.id,
                        ...a,
                        status: 'proposed'
                    }))
                );
            }

            return finalActions;
        } catch (error) {
            console.error('Action suggestion failed:', error);
            throw error;
        }
    }

    /**
     * Analyze available credit lines for liquidity support
     */
    async analyzeCreditLines(userId, amount) {
        const availableLines = await db.select()
            .from(creditLines)
            .where(eq(creditLines.userId, userId));

        const suggestions = [];

        for (const line of availableLines) {
            const remainingLimit = parseFloat(line.creditLimit) - parseFloat(line.currentBalance);
            if (remainingLimit > 0) {
                const drawAmount = Math.min(amount, remainingLimit);
                const interestRate = parseFloat(line.interestRate);

                // Arbitrage logic: If interest rate < 10%, it's a good score
                const impactScore = interestRate < 10 ? 90 : 60;

                suggestions.push({
                    actionType: 'credit_draw',
                    resourceType: 'credit_line',
                    resourceId: line.id,
                    amount: drawAmount.toString(),
                    costOfCapital: interestRate,
                    impactScore,
                    reason: `Draw from ${line.provider} (${line.type}) at ${interestRate}% interest. This is more cost-effective than liquidating long-term assets.`,
                    metadata: { provider: line.provider, type: line.type }
                });
            }
        }

        return suggestions;
    }

    /**
     * Analyze investments for potential liquidation
     */
    async analyzeAssetLiquidation(userId, amount) {
        const userInvestments = await db.select()
            .from(investments)
            .where(and(
                eq(investments.userId, userId),
                eq(investments.isActive, true)
            ));

        const taxProfile = await taxService.getUserTaxProfile(userId);
        const incomeBracket = taxProfile?.estimatedTaxBracket || '22%';
        const suggestions = [];

        for (const inv of userInvestments) {
            const mktVal = parseFloat(inv.marketValue);
            if (mktVal > 0) {
                const sellAmount = Math.min(amount, mktVal);

                // Calculate tax impact
                const costBasis = parseFloat(inv.totalCost) * (sellAmount / mktVal);
                const gain = Math.max(0, sellAmount - costBasis);

                // Estimate if long term (>365 days)
                const isLongTerm = inv.purchaseDate ?
                    (new Date() - new Date(inv.purchaseDate)) > (365 * 24 * 60 * 60 * 1000) : true;

                const estimatedTax = taxService.calculateCapitalGainsTax(gain, isLongTerm, incomeBracket);

                // Simplified cost: Opportunity cost of 7% (average market return)
                const costOfCapital = 7.0;

                suggestions.push({
                    actionType: 'asset_sale',
                    resourceType: 'investment',
                    resourceId: inv.id,
                    amount: sellAmount.toString(),
                    costOfCapital,
                    impactScore: 75,
                    taxImpact: estimatedTax.toString(),
                    reason: `Liquidate ${inv.symbol} (${inv.name}) as a high-liquidity fallback. Estimated tax impact: $${estimatedTax.toFixed(2)}.`,
                    metadata: { symbol: inv.symbol, isLongTerm, estimatedGain: gain }
                });
            }
        }

        return suggestions;
    }

    /**
     * Execute a proposed action
     */
    async executeAction(userId, actionId) {
        try {
            const [action] = await db.select()
                .from(liquidityOptimizerActions)
                .where(and(
                    eq(liquidityOptimizerActions.id, actionId),
                    eq(liquidityOptimizerActions.userId, userId)
                ));

            if (!action) throw new Error('Action not found');
            if (action.status !== 'proposed') throw new Error('Action already processed');

            // In a real system, this would trigger external API calls (Bank/Brokerage)
            // Here we update internal state

            if (action.actionType === 'credit_draw') {
                const [line] = await db.select().from(creditLines).where(eq(creditLines.id, action.resourceId));
                await db.update(creditLines)
                    .set({
                        currentBalance: (parseFloat(line.currentBalance) + parseFloat(action.amount)).toString(),
                        updatedAt: new Date()
                    })
                    .where(eq(creditLines.id, line.id));
            }

            await db.update(liquidityOptimizerActions)
                .set({
                    status: 'executed',
                    executedAt: new Date()
                })
                .where(eq(liquidityOptimizerActions.id, actionId));

            return { success: true, action };
        } catch (error) {
            console.error('Action execution failed:', error);
            throw error;
        }
    }

    /**
     * MILP-Based Cross-Border Liquidity Transfer Optimizer (#476)
     * Finds the most capital-efficient path for moving liquidity.
     */
    async findOptimalRoute(userId, sourceVaultId, destVaultId, amount) {
        try {
            // 1. Fetch environment data
            const [userVaults, userEntities, allDebts, fxRates] = await Promise.all([
                db.select().from(vaults).where(eq(vaults.ownerId, userId)),
                db.select().from(entities).where(eq(entities.userId, userId)),
                db.select().from(internalDebts).where(eq(internalDebts.userId, userId)),
                db.select().from(marketRatesOracle)
            ]);

            // 2. Build the Graph
            // Nodes are vault IDs
            // Edges represent transfer paths with efficiencies
            const nodes = userVaults.map(v => v.id);
            const edges = [];

            // A. Direct Transfer Edges (Bank/FX)
            for (const vFrom of userVaults) {
                for (const vTo of userVaults) {
                    if (vFrom.id === vTo.id) continue;

                    let efficiency = 1.0;
                    const fromCurrency = vFrom.currency;
                    const toCurrency = vTo.currency;

                    // FX Efficiency
                    if (fromCurrency !== toCurrency) {
                        const rate = fxRates.find(r => r.baseCurrency === fromCurrency && r.quoteCurrency === toCurrency);
                        if (rate && rate.bidRate && rate.midRate) {
                            efficiency *= (parseFloat(rate.bidRate) / parseFloat(rate.midRate));
                        } else {
                            efficiency *= 0.998; // Default 0.2% spread
                        }
                    }

                    // Bank Fee Efficiency (Simulated base cost)
                    efficiency *= 0.999; // 0.1% bank fee

                    // Inter-Entity Tax Efficiency
                    const entityFrom = userEntities.find(e => e.metadata?.vaultIds?.includes(vFrom.id));
                    const entityTo = userEntities.find(e => e.metadata?.vaultIds?.includes(vTo.id));
                    if (entityFrom && entityTo && entityFrom.id !== entityTo.id) {
                        const taxRate = this.getWithholdingRate(entityFrom.type, entityTo.type);
                        efficiency *= (1 - taxRate);
                    }

                    edges.push({
                        from: vFrom.id,
                        to: vTo.id,
                        efficiency,
                        type: 'direct_transfer',
                        description: `Transfer from ${vFrom.name} to ${vTo.name}`
                    });
                }
            }

            // B. Internal Debt Settlement Edges (Repayment/Forgiveness)
            // If V_A owes V_B, moving money from A to B is a repayment.
            for (const debt of allDebts) {
                if (debt.status !== 'active') continue;

                // Edge: Borrower -> Lender (Moving money TO lender by repaying)
                edges.push({
                    from: debt.borrowerVaultId,
                    to: debt.lenderVaultId,
                    efficiency: 1.0, // High efficiency (clearing internal liability)
                    type: 'debt_repayment',
                    description: `Repay internal debt from ${debt.borrowerVaultId.substring(0, 8)} to ${debt.lenderVaultId.substring(0, 8)}`,
                    debtId: debt.id
                });

                // Edge: Lender -> Borrower (Forgiving debt to "move" liquidity)
                // In some jurisdictions, forgiving debt acts as a distribution/gift
                edges.push({
                    from: debt.lenderVaultId,
                    to: debt.borrowerVaultId,
                    efficiency: 0.995, // Slight cost (accounting overhead/potential gift tax)
                    type: 'debt_forgiveness',
                    description: `Forgive internal debt to ${debt.borrowerVaultId.substring(0, 8)}`,
                    debtId: debt.id
                });
            }

            // 3. Solve for Optimal Path using Bellman-Ford (Maximizing efficiency)
            // Transforming to: Minimize Σ -log(efficiency)
            const distances = {};
            const previous = {};
            const edgeInfo = {};

            nodes.forEach(n => {
                distances[n] = Infinity;
                previous[n] = null;
            });
            distances[sourceVaultId] = 0;

            for (let i = 0; i < nodes.length - 1; i++) {
                for (const edge of edges) {
                    const weight = -Math.log(edge.efficiency);
                    if (distances[edge.from] + weight < distances[edge.to]) {
                        distances[edge.to] = distances[edge.from] + weight;
                        previous[edge.to] = edge.from;
                        edgeInfo[edge.to] = edge;
                    }
                }
            }

            // 4. Reconstruct Path
            const path = [];
            let curr = destVaultId;
            while (curr && curr !== sourceVaultId) {
                const info = edgeInfo[curr];
                if (!info) break;
                path.unshift(info);
                curr = previous[curr];
            }

            if (curr !== sourceVaultId && nodes.length > 0) {
                throw new Error('No path found between the specified vaults.');
            }

            const totalEfficiency = Math.exp(-distances[destVaultId]);
            const finalAmount = amount * totalEfficiency;

            return {
                sourceVaultId,
                destVaultId,
                requestedAmount: amount,
                estimatedArrivalAmount: finalAmount.toFixed(2),
                totalEfficiency: (totalEfficiency * 100).toFixed(4) + '%',
                path: path.map(p => ({
                    step: p.description,
                    type: p.type,
                    efficiency: (p.efficiency * 100).toFixed(4) + '%',
                    metadata: p.debtId ? { debtId: p.debtId } : {}
                }))
            };

        } catch (error) {
            console.error('Optimal route calculation failed:', error);
            throw error;
        }
    }

    /**
     * Determines the withholding tax rate between different entity types
     */
    getWithholdingRate(fromType, toType) {
        if (fromType === toType) return 0.0;

        // Simple logic: Distributions from Corp/LLC to Personal have withholding
        if (toType === 'personal') {
            if (fromType === 'corp') return 0.15; // 15% dividend tax
            if (fromType === 'trust') return 0.0; // Trust distributions often pass through
            if (fromType === 'llc') return 0.05; // 5% self-employment/draw tax
        }

        // Inter-company transfers
        if (fromType === 'corp' && toType === 'llc') return 0.21; // Corporate income tax

        return 0.02; // Default 2% friction for mismatched entities
    }
}

export default new LiquidityOptimizerService();

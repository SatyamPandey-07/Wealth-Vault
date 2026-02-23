import db from '../config/db.js';
import { vaults, internalDebts, vaultBalances } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Utility for recursive net worth calculation and circular reference detection.
 * Handles the interlocking network of internal assets and liabilities.
 */
export class NetWorthGraph {
    constructor(userId) {
        this.userId = userId;
        this.nodes = new Map(); // vaultId -> node
        this.isBuilt = false;
    }

    /**
     * Builds the graph from the database.
     */
    async build() {
        // Fetch all vaults owned by the user
        const userVaults = await db.select().from(vaults).where(eq(vaults.ownerId, this.userId));

        // Fetch all balances
        const balances = await db.select().from(vaultBalances).where(eq(vaultBalances.userId, this.userId));

        for (const v of userVaults) {
            const vaultBalance = balances
                .filter(b => b.vaultId === v.id)
                .reduce((acc, b) => acc + parseFloat(b.balance || 0), 0);

            this.nodes.set(v.id, {
                id: v.id,
                name: v.name,
                cashBalance: vaultBalance,
                assets: [],
                liabilities: []
            });
        }

        // Fetch internal debts
        const debts = await db.select().from(internalDebts).where(eq(internalDebts.userId, this.userId));

        for (const d of debts) {
            if (this.nodes.has(d.lenderVaultId)) {
                this.nodes.get(d.lenderVaultId).assets.push({
                    id: d.id,
                    targetVaultId: d.borrowerVaultId,
                    amount: parseFloat(d.currentBalance),
                    interestRate: parseFloat(d.interestRate)
                });
            }
            if (this.nodes.has(d.borrowerVaultId)) {
                this.nodes.get(d.borrowerVaultId).liabilities.push({
                    id: d.id,
                    sourceVaultId: d.lenderVaultId,
                    amount: parseFloat(d.currentBalance),
                    interestRate: parseFloat(d.interestRate)
                });
            }
        }

        this.isBuilt = true;
    }

    /**
     * Calculates net worth for a specific vault.
     */
    getVaultNetWorth(vaultId) {
        if (!this.isBuilt) throw new Error("Graph not built. Call build() first.");
        const node = this.nodes.get(vaultId);
        if (!node) return 0;

        // Net Worth = Cash + Internal Assets - Internal Liabilities
        let netWorth = node.cashBalance;

        for (const asset of node.assets) {
            netWorth += asset.amount;
        }

        for (const liability of node.liabilities) {
            netWorth -= liability.amount;
        }

        return netWorth;
    }

    /**
     * Detects circular lending paths.
     * Returns an array of cycles if found.
     */
    detectCycles() {
        const visited = new Set();
        const recStack = new Set();
        const cycles = [];

        const findCycles = (u, path = []) => {
            visited.add(u);
            recStack.add(u);
            path.push(u);

            const node = this.nodes.get(u);
            if (node) {
                for (const asset of node.assets) {
                    const v = asset.targetVaultId;
                    if (!visited.has(v)) {
                        findCycles(v, [...path]);
                    } else if (recStack.has(v)) {
                        // Cycle found!
                        const cycleStartIdx = path.indexOf(v);
                        cycles.push(path.slice(cycleStartIdx));
                    }
                }
            }

            recStack.delete(u);
            return cycles;
        };

        for (const vaultId of this.nodes.keys()) {
            if (!visited.has(vaultId)) {
                findCycles(vaultId);
            }
        }

        return cycles;
    }

    /**
     * Returns a summary for all vaults.
     */
    getAllVaultsSummary() {
        const summary = [];
        for (const [id, node] of this.nodes.entries()) {
            summary.push({
                id,
                name: node.name,
                cashBalance: node.cashBalance,
                internalAssets: node.assets.reduce((acc, a) => acc + a.amount, 0),
                internalLiabilities: node.liabilities.reduce((acc, l) => acc + l.amount, 0),
                netWorth: this.getVaultNetWorth(id)
            });
        }
        return summary;
    }
}

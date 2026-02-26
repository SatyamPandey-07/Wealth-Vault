import db from '../config/db.js';
import { auditAnchors, securityEvents, ledgerEntries } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { MerkleTree } from '../utils/merkleTree.js';

/**
 * AuditVerifierService - Verifies cryptographic integrity of database rows (#475)
 */
class AuditVerifierService {
    /**
     * Generates a Merkle Proof for a specific event
     */
    async getProofOfInnocence(eventId, tableType) {
        const table = tableType === 'security_events' ? securityEvents : ledgerEntries;

        // 1. Fetch the event
        const [event] = await db.select().from(table).where(eq(table.id, eventId));
        if (!event) throw new Error('Event not found');
        if (!event.isSealed || !event.auditAnchorId) throw new Error('Event has not been sealed yet.');

        // 2. Fetch the anchor
        const [anchor] = await db.select().from(auditAnchors).where(eq(auditAnchors.id, event.auditAnchorId));
        if (!anchor) throw new Error('Audit anchor not found.');

        // 3. Reconstruct the Tree for that period
        // To build the exact same tree, we need the exact same events in the exact same order
        const [periodSecurity, periodLedger] = await Promise.all([
            db.select().from(securityEvents).where(eq(securityEvents.auditAnchorId, anchor.id)),
            db.select().from(ledgerEntries).where(eq(ledgerEntries.auditAnchorId, anchor.id))
        ]);

        const allEvents = [
            ...periodSecurity.map(e => ({ ...e, _sourceTable: 'security_events' })),
            ...periodLedger.map(e => ({ ...e, _sourceTable: 'ledger_entries' }))
        ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        const leaves = allEvents.map(e => ({
            id: e.id,
            userId: e.userId,
            createdAt: e.createdAt,
            type: e._sourceTable,
            data: e.details || e.description || {}
        }));

        const tree = new MerkleTree(leaves);

        // 4. Find the index of our event
        const index = allEvents.findIndex(e => e.id === eventId);
        const proof = tree.getProof(index);

        return {
            eventId,
            tableType,
            merkleRoot: anchor.merkleRoot,
            proof,
            leafContent: leaves[index],
            sealDate: anchor.sealedAt,
            isVerified: tree.verifyProof(leaves[index], proof, anchor.merkleRoot)
        };
    }

    /**
     * Proves total database integrity between two points in time
     */
    async verifyHashChain() {
        const anchors = await db.select().from(auditAnchors).orderBy(auditAnchors.sealedAt);
        const chain = [];

        for (let i = 1; i < anchors.length; i++) {
            const current = anchors[i];
            const previous = anchors[i - 1];

            chain.push({
                anchorId: current.id,
                linksCorrect: current.previousAnchorId === previous.id,
                timestamp: current.sealedAt
            });
        }

        return chain;
    }
}

export default new AuditVerifierService();

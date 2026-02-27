import cron from 'node-cron';
import db from '../config/db.js';
import { securityEvents, ledgerEntries, auditAnchors } from '../db/schema.js';
import { eq, and, sql, isNull, desc } from 'drizzle-orm';
import { MerkleTree } from '../utils/merkleTree.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * AuditTrailSealer Job (#475)
 * Hourly background process to anchor high-stakes events in a Merkle Root.
 */
class AuditTrailSealer {
    constructor() {
        this.isRunning = false;
    }

    start() {
        // Run every hour at the top of the hour
        cron.schedule('0 * * * *', async () => {
            await this.sealBatch();
        });
        logInfo('AuditTrailSealer Job scheduled (hourly)');
    }

    async sealBatch() {
        if (this.isRunning) return;
        this.isRunning = true;
        logInfo('📝 Starting Hourly Audit Trail Sealing...');

        try {
            const now = new Date();
            const periodEnd = new Date(now);
            periodEnd.setMinutes(0, 0, 0); // Seal up to the previous hour boundary

            const periodStart = new Date(periodEnd);
            periodStart.setHours(periodStart.getHours() - 1);

            // 1. Fetch unsealed high-stakes events
            const [unsealedSecurity, unsealedLedger] = await Promise.all([
                db.select().from(securityEvents).where(
                    and(
                        eq(securityEvents.isSealed, false),
                        sql`${securityEvents.createdAt} < ${periodEnd}`
                    )
                ),
                db.select().from(ledgerEntries).where(
                    and(
                        eq(ledgerEntries.isSealed, false),
                        sql`${ledgerEntries.createdAt} < ${periodEnd}`
                    )
                )
            ]);

            const allEvents = [
                ...unsealedSecurity.map(e => ({ ...e, _sourceTable: 'security_events' })),
                ...unsealedLedger.map(e => ({ ...e, _sourceTable: 'ledger_entries' }))
            ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            if (allEvents.length === 0) {
                logInfo('No events to seal for this period.');
                this.isRunning = false;
                return;
            }

            // 2. Generate Merkle Tree
            // Standardizing the leaf content for consistency
            const leaves = allEvents.map(e => ({
                id: e.id,
                userId: e.userId,
                createdAt: e.createdAt,
                type: e._sourceTable,
                data: e.details || e.description || {}
            }));

            const tree = new MerkleTree(leaves);
            const root = tree.getRoot();

            // 3. Get Previous Anchor (Hash Chain)
            const [lastAnchor] = await db.select().from(auditAnchors).orderBy(desc(auditAnchors.sealedAt)).limit(1);

            // 4. Commit Anchor Record
            const [newAnchor] = await db.insert(auditAnchors).values({
                merkleRoot: root,
                previousAnchorId: lastAnchor?.id || null,
                eventCount: allEvents.length,
                periodStart,
                periodEnd,
                sealMetadata: {
                    securityEventIds: unsealedSecurity.map(e => e.id),
                    ledgerEntryIds: unsealedLedger.map(e => e.id)
                }
            }).returning();

            // 5. Update events as SEALED
            await Promise.all([
                db.update(securityEvents)
                    .set({ isSealed: true, auditAnchorId: newAnchor.id })
                    .where(isNull(securityEvents.auditAnchorId)),
                db.update(ledgerEntries)
                    .set({ isSealed: true, auditAnchorId: newAnchor.id })
                    .where(isNull(ledgerEntries.auditAnchorId))
            ]);

            logInfo(`✅ Successfully sealed ${allEvents.length} events. Merkle Root: ${root.substring(0, 16)}...`);

        } catch (error) {
            logError('AuditTrailSealer failed:', error);
        } finally {
            this.isRunning = false;
        }
    }
}

export default new AuditTrailSealer();

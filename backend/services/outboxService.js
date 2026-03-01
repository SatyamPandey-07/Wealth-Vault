import { db } from '../config/db.js';
import { outboxEvents } from '../db/schema.js';
import { eq, and, or, lte, isNull } from 'drizzle-orm';
import logger from '../utils/logger.js';

/**
 * Outbox Service - Transactional Outbox Pattern Implementation
 * 
 * Ensures reliable event publishing by storing events in the same transaction as business data.
 * Events are then dispatched by a background worker to external systems/message bus.
 * 
 * This prevents data inconsistencies between the database and external systems.
 */

class OutboxService {
    /**
     * Create a new outbox event within a database transaction
     * @param {Object} tx - Database transaction object
     * @param {Object} event - Event details
     * @param {string} event.tenantId - Tenant ID
     * @param {string} event.aggregateType - Type of aggregate (e.g., 'tenant', 'user', 'expense')
     * @param {string} event.aggregateId - ID of the aggregate
     * @param {string} event.eventType - Event type (e.g., 'tenant.created', 'user.invited')
     * @param {Object} event.payload - Event payload data
     * @param {Object} event.metadata - Optional metadata
     * @returns {Promise<Object>} Created outbox event
     */
    async createEvent(tx, { tenantId, aggregateType, aggregateId, eventType, payload, metadata = {} }) {
        try {
            const [event] = await tx.insert(outboxEvents).values({
                tenantId: tenantId || null,
                aggregateType,
                aggregateId,
                eventType,
                payload,
                metadata: {
                    ...metadata,
                    createdBy: 'system',
                    timestamp: new Date().toISOString()
                },
                status: 'pending',
                retryCount: 0,
                maxRetries: 3
            }).returning();

            logger.info('Outbox event created', {
                eventId: event.id,
                eventType: event.eventType,
                aggregateType: event.aggregateType,
                aggregateId: event.aggregateId
            });

            return event;
        } catch (error) {
            logger.error('Failed to create outbox event', {
                error: error.message,
                eventType,
                aggregateType,
                aggregateId
            });
            throw error;
        }
    }

    /**
     * Create multiple outbox events in a single transaction
     * @param {Object} tx - Database transaction object
     * @param {Array<Object>} events - Array of event objects
     * @returns {Promise<Array<Object>>} Created outbox events
     */
    async createEvents(tx, events) {
        try {
            const eventValues = events.map(event => ({
                tenantId: event.tenantId || null,
                aggregateType: event.aggregateType,
                aggregateId: event.aggregateId,
                eventType: event.eventType,
                payload: event.payload,
                metadata: {
                    ...event.metadata || {},
                    createdBy: 'system',
                    timestamp: new Date().toISOString()
                },
                status: 'pending',
                retryCount: 0,
                maxRetries: event.maxRetries || 3
            }));

            const createdEvents = await tx.insert(outboxEvents).values(eventValues).returning();

            logger.info('Multiple outbox events created', {
                count: createdEvents.length,
                eventTypes: events.map(e => e.eventType)
            });

            return createdEvents;
        } catch (error) {
            logger.error('Failed to create multiple outbox events', {
                error: error.message,
                count: events.length
            });
            throw error;
        }
    }

    /**
     * Get pending events ready for processing
     * @param {number} limit - Maximum number of events to fetch
     * @returns {Promise<Array<Object>>} Pending events
     */
    async getPendingEvents(limit = 100) {
        try {
            const events = await db
                .select()
                .from(outboxEvents)
                .where(
                    or(
                        eq(outboxEvents.status, 'pending'),
                        and(
                            eq(outboxEvents.status, 'failed'),
                            lte(outboxEvents.retryCount, outboxEvents.maxRetries)
                        )
                    )
                )
                .orderBy(outboxEvents.createdAt)
                .limit(limit);

            return events;
        } catch (error) {
            logger.error('Failed to fetch pending events', { error: error.message });
            throw error;
        }
    }

    /**
     * Mark an event as processing
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Updated event
     */
    async markAsProcessing(eventId) {
        try {
            const [event] = await db
                .update(outboxEvents)
                .set({
                    status: 'processing',
                    processedAt: new Date(),
                    updatedAt: new Date()
                })
                .where(eq(outboxEvents.id, eventId))
                .returning();

            return event;
        } catch (error) {
            logger.error('Failed to mark event as processing', {
                error: error.message,
                eventId
            });
            throw error;
        }
    }

    /**
     * Mark an event as successfully published
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Updated event
     */
    async markAsPublished(eventId) {
        try {
            const [event] = await db
                .update(outboxEvents)
                .set({
                    status: 'published',
                    publishedAt: new Date(),
                    updatedAt: new Date()
                })
                .where(eq(outboxEvents.id, eventId))
                .returning();

            logger.info('Event published successfully', {
                eventId: event.id,
                eventType: event.eventType
            });

            return event;
        } catch (error) {
            logger.error('Failed to mark event as published', {
                error: error.message,
                eventId
            });
            throw error;
        }
    }

    /**
     * Mark an event as failed and increment retry count
     * @param {string} eventId - Event ID
     * @param {string} errorMessage - Error message
     * @returns {Promise<Object>} Updated event
     */
    async markAsFailed(eventId, errorMessage) {
        try {
            const [event] = await db
                .update(outboxEvents)
                .set({
                    status: 'failed',
                    lastError: errorMessage,
                    retryCount: db.raw('retry_count + 1'),
                    updatedAt: new Date()
                })
                .where(eq(outboxEvents.id, eventId))
                .returning();

            logger.warn('Event marked as failed', {
                eventId: event.id,
                eventType: event.eventType,
                retryCount: event.retryCount,
                error: errorMessage
            });

            return event;
        } catch (error) {
            logger.error('Failed to mark event as failed', {
                error: error.message,
                eventId
            });
            throw error;
        }
    }

    /**
     * Get event by ID
     * @param {string} eventId - Event ID
     * @returns {Promise<Object>} Event
     */
    async getEventById(eventId) {
        try {
            const [event] = await db
                .select()
                .from(outboxEvents)
                .where(eq(outboxEvents.id, eventId));

            return event;
        } catch (error) {
            logger.error('Failed to fetch event by ID', {
                error: error.message,
                eventId
            });
            throw error;
        }
    }

    /**
     * Get events by aggregate
     * @param {string} aggregateType - Aggregate type
     * @param {string} aggregateId - Aggregate ID
     * @returns {Promise<Array<Object>>} Events
     */
    async getEventsByAggregate(aggregateType, aggregateId) {
        try {
            const events = await db
                .select()
                .from(outboxEvents)
                .where(
                    and(
                        eq(outboxEvents.aggregateType, aggregateType),
                        eq(outboxEvents.aggregateId, aggregateId)
                    )
                )
                .orderBy(outboxEvents.createdAt);

            return events;
        } catch (error) {
            logger.error('Failed to fetch events by aggregate', {
                error: error.message,
                aggregateType,
                aggregateId
            });
            throw error;
        }
    }

    /**
     * Delete old published events (for cleanup)
     * @param {number} daysOld - Delete events older than this many days
     * @returns {Promise<number>} Number of deleted events
     */
    async deleteOldPublishedEvents(daysOld = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const result = await db
                .delete(outboxEvents)
                .where(
                    and(
                        eq(outboxEvents.status, 'published'),
                        lte(outboxEvents.publishedAt, cutoffDate)
                    )
                );

            logger.info('Old published events deleted', {
                daysOld,
                deletedCount: result.rowCount || 0
            });

            return result.rowCount || 0;
        } catch (error) {
            logger.error('Failed to delete old published events', {
                error: error.message,
                daysOld
            });
            throw error;
        }
    }
}

export default new OutboxService();

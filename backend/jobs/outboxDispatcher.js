import outboxService from '../services/outboxService.js';
import logger from '../utils/logger.js';
import EventEmitter from 'events';

/**
 * Outbox Dispatcher - Background job for processing and publishing outbox events
 * 
 * Polls the outbox table for pending events and publishes them to a message bus or event handlers.
 * Implements idempotent processing, retries with exponential backoff, and dead-letter handling.
 * 
 * This ensures at-least-once delivery of events from the transactional outbox to external systems.
 */

class OutboxDispatcher extends EventEmitter {
    constructor() {
        super();
        this.isRunning = false;
        this.intervalId = null;
        this.pollInterval = process.env.OUTBOX_POLL_INTERVAL || 5000; // 5 seconds default
        this.batchSize = process.env.OUTBOX_BATCH_SIZE || 50;
        this.eventHandlers = new Map();
    }

    /**
     * Register an event handler for a specific event type
     * @param {string} eventType - Event type pattern (supports wildcards)
     * @param {Function} handler - Handler function(event)
     */
    on(eventType, handler) {
        if (typeof handler !== 'function') {
            throw new Error('Handler must be a function');
        }

        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }

        this.eventHandlers.get(eventType).push(handler);
        logger.info('Event handler registered', { eventType });
    }

    /**
     * Get handlers for a specific event type
     * @param {string} eventType - Event type
     * @returns {Array<Function>} Matching handlers
     * @private
     */
    getHandlers(eventType) {
        const handlers = [];

        for (const [pattern, handlerList] of this.eventHandlers.entries()) {
            // Support wildcard patterns like 'tenant.*' or '*'
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            if (regex.test(eventType)) {
                handlers.push(...handlerList);
            }
        }

        return handlers;
    }

    /**
     * Start the dispatcher
     */
    start() {
        if (this.isRunning) {
            logger.warn('Outbox dispatcher is already running');
            return;
        }

        this.isRunning = true;
        logger.info('Starting outbox dispatcher', {
            pollInterval: this.pollInterval,
            batchSize: this.batchSize
        });

        // Start polling loop
        this.poll();
        this.intervalId = setInterval(() => this.poll(), this.pollInterval);

        logger.info('Outbox dispatcher started');
    }

    /**
     * Stop the dispatcher
     */
    stop() {
        if (!this.isRunning) {
            logger.warn('Outbox dispatcher is not running');
            return;
        }

        this.isRunning = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        logger.info('Outbox dispatcher stopped');
    }

    /**
     * Poll for pending events and process them
     * @private
     */
    async poll() {
        if (!this.isRunning) {
            return;
        }

        try {
            const events = await outboxService.getPendingEvents(this.batchSize);

            if (events.length === 0) {
                return;
            }

            logger.debug('Processing outbox events batch', {
                count: events.length
            });

            // Process events in parallel with concurrency limit
            await this.processEventsInParallel(events, 10);

        } catch (error) {
            logger.error('Error polling outbox events', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Process events in parallel with concurrency control
     * @param {Array<Object>} events - Events to process
     * @param {number} concurrency - Maximum concurrent processing
     * @private
     */
    async processEventsInParallel(events, concurrency) {
        const processing = [];
        
        for (const event of events) {
            const promise = this.processEvent(event);
            processing.push(promise);

            // Wait if we've reached concurrency limit
            if (processing.length >= concurrency) {
                await Promise.race(processing);
                // Remove completed promises
                processing.splice(0, processing.findIndex(p => p.settled) + 1);
            }
        }

        // Wait for remaining events
        await Promise.allSettled(processing);
    }

    /**
     * Process a single outbox event
     * @param {Object} event - Outbox event
     * @private
     */
    async processEvent(event) {
        try {
            // Mark as processing
            await outboxService.markAsProcessing(event.id);

            // Get handlers for this event type
            const handlers = this.getHandlers(event.eventType);

            if (handlers.length === 0) {
                logger.warn('No handlers registered for event type', {
                    eventId: event.id,
                    eventType: event.eventType
                });
                // Still mark as published since there's nothing to do
                await outboxService.markAsPublished(event.id);
                return;
            }

            // Execute all handlers
            const handlerResults = await Promise.allSettled(
                handlers.map(handler => this.executeHandler(handler, event))
            );

            // Check if any handler failed
            const failures = handlerResults.filter(r => r.status === 'rejected');
            
            if (failures.length > 0) {
                const errors = failures.map(f => f.reason.message).join('; ');
                throw new Error(`Handler failures: ${errors}`);
            }

            // All handlers succeeded
            await outboxService.markAsPublished(event.id);

            // Emit success event for monitoring
            this.emit('event:published', {
                eventId: event.id,
                eventType: event.eventType,
                handlerCount: handlers.length
            });

        } catch (error) {
            logger.error('Failed to process outbox event', {
                eventId: event.id,
                eventType: event.eventType,
                error: error.message,
                retryCount: event.retryCount
            });

            await outboxService.markAsFailed(event.id, error.message);

            // Check if max retries exceeded
            if (event.retryCount >= event.maxRetries) {
                this.emit('event:dead-letter', {
                    eventId: event.id,
                    eventType: event.eventType,
                    error: error.message
                });

                logger.error('Event moved to dead letter (max retries exceeded)', {
                    eventId: event.id,
                    eventType: event.eventType,
                    retryCount: event.retryCount,
                    maxRetries: event.maxRetries
                });
            } else {
                this.emit('event:retry', {
                    eventId: event.id,
                    eventType: event.eventType,
                    retryCount: event.retryCount + 1
                });
            }
        }
    }

    /**
     * Execute a single event handler with timeout
     * @param {Function} handler - Handler function
     * @param {Object} event - Outbox event
     * @private
     */
    async executeHandler(handler, event) {
        const timeout = 30000; // 30 seconds

        return Promise.race([
            handler(event),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Handler timeout')), timeout)
            )
        ]);
    }

    /**
     * Get dispatcher status and metrics
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            pollInterval: this.pollInterval,
            batchSize: this.batchSize,
            registeredHandlers: Array.from(this.eventHandlers.keys()),
            handlerCount: Array.from(this.eventHandlers.values()).reduce((sum, arr) => sum + arr.length, 0)
        };
    }
}

// Create singleton instance
const dispatcher = new OutboxDispatcher();

// Register default handlers
dispatcher.on('tenant.created', async (event) => {
    logger.info('Handling tenant.created event', {
        eventId: event.id,
        tenantId: event.aggregateId
    });
    // Add your tenant creation side effects here
    // e.g., send welcome email, create default categories, etc.
});

dispatcher.on('tenant.member.invited', async (event) => {
    logger.info('Handling tenant.member.invited event', {
        eventId: event.id,
        payload: event.payload
    });
    // Add member invitation side effects here
    // e.g., send invitation email
});

dispatcher.on('user.registered', async (event) => {
    logger.info('Handling user.registered event', {
        eventId: event.id,
        userId: event.aggregateId
    });
    // Add user registration side effects here
    // e.g., send welcome email, create default preferences
});

dispatcher.on('expense.created', async (event) => {
    logger.info('Handling expense.created event', {
        eventId: event.id,
        expenseId: event.aggregateId
    });
    // Add expense creation side effects here
    // e.g., update analytics, check budget alerts
});

dispatcher.on('goal.completed', async (event) => {
    logger.info('Handling goal.completed event', {
        eventId: event.id,
        goalId: event.aggregateId
    });
    // Add goal completion side effects here
    // e.g., send congratulations email, trigger celebration
});

// Wildcard handler for logging all events
dispatcher.on('*', async (event) => {
    logger.debug('Event processed', {
        eventId: event.id,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId
    });
});

export default dispatcher;

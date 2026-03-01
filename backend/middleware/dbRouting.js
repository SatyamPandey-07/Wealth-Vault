import { getDBRouter } from '../services/dbRouterService.js';
import logger from '../utils/logger.js';

/**
 * Database Routing Middleware
 * 
 * Provides convenient request-level database connection selection:
 * - Attaches appropriate DB connection to req.db
 * - Manages session-based consistency 
 * - Exposes routing metadata
 * 
 * Usage:
 *   app.use(attachDBConnection());
 *   
 *   // In route handlers:
 *   const users = await req.db.select().from(usersTable); // Auto-routed
 *   
 *   // Force primary:
 *   req.useDBPrimary();
 *   const criticalData = await req.db.select().from(paymentsTable);
 */

/**
 * Attach database connection to request
 * @param {Object} options - Middleware options
 * @param {boolean} options.enableSessionTracking - Track sessions for consistency (default: true)
 * @param {boolean} options.preferReplicas - Prefer replicas for reads (default: true)
 * @returns {Function} Express middleware
 */
export function attachDBConnection(options = {}) {
    const {
        enableSessionTracking = true,
        preferReplicas = true
    } = options;

    return (req, res, next) => {
        const router = getDBRouter();
        
        // Initialize request DB context
        req.dbContext = {
            forcePrimary: false,
            critical: false,
            sessionId: null,
            routingDecision: null
        };

        // Attach session ID for consistency tracking
        if (enableSessionTracking) {
            // Use session ID if available, otherwise generate from user/IP
            req.dbContext.sessionId = 
                req.session?.id || 
                req.user?.id || 
                `${req.ip}-${req.headers['user-agent']}`;
        }

        /**
         * Helper: Force next query to use primary
         */
        req.useDBPrimary = () => {
            req.dbContext.forcePrimary = true;
            logger.debug('Forced primary for request', {
                path: req.path,
                sessionId: req.dbContext.sessionId
            });
        };

        /**
         * Helper: Mark next read as critical (uses primary)
         */
        req.useCriticalRead = () => {
            req.dbContext.critical = true;
            logger.debug('Marked critical read for request', {
                path: req.path,
                sessionId: req.dbContext.sessionId
            });
        };

        /**
         * Get database connection for read operation
         * @param {Object} opts - Query options
         * @returns {Object} Database connection
         */
        req.getReadDB = (opts = {}) => {
            const routingOptions = {
                operation: 'read',
                forcePrimary: req.dbContext.forcePrimary || opts.forcePrimary || false,
                critical: req.dbContext.critical || opts.critical || false,
                sessionId: req.dbContext.sessionId
            };

            const result = router.getConnection(routingOptions);
            req.dbContext.routingDecision = result;

            // Reset flags after use
            req.dbContext.forcePrimary = false;
            req.dbContext.critical = false;

            return result.db;
        };

        /**
         * Get database connection for write operation
         * @returns {Object} Database connection (always primary)
         */
        req.getWriteDB = () => {
            const result = router.getConnection({
                operation: 'write',
                sessionId: req.dbContext.sessionId
            });

            req.dbContext.routingDecision = result;

            return result.db;
        };

        /**
         * Smart DB accessor - routes based on HTTP method
         * GET → Read (can use replica)
         * POST/PUT/PATCH/DELETE → Write (uses primary)
         */
        Object.defineProperty(req, 'db', {
            get() {
                const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
                
                if (isWriteMethod) {
                    return req.getWriteDB();
                } else {
                    return req.getReadDB();
                }
            }
        });

        // Add routing metadata to response headers (for debugging)
        const originalJson = res.json.bind(res);
        res.json = function(data) {
            if (req.dbContext.routingDecision && process.env.EXPOSE_DB_ROUTING === 'true') {
                res.setHeader('X-DB-Target', req.dbContext.routingDecision.target);
                res.setHeader('X-DB-Reason', req.dbContext.routingDecision.reason);
                
                if (req.dbContext.routingDecision.lag !== undefined) {
                    res.setHeader('X-DB-Replica-Lag', req.dbContext.routingDecision.lag);
                }
            }
            return originalJson(data);
        };

        next();
    };
}

/**
 * Middleware to force primary database for specific routes
 * @returns {Function} Express middleware
 */
export function forcePrimaryDB() {
    return (req, res, next) => {
        req.useDBPrimary();
        next();
    };
}

/**
 * Middleware to mark route as critical read
 * @returns {Function} Express middleware
 */
export function criticalRead() {
    return (req, res, next) => {
        req.useCriticalRead();
        next();
    };
}

/**
 * Middleware to attach router metrics to response
 * Useful for monitoring endpoints
 */
export function attachDBMetrics() {
    return (req, res, next) => {
        const router = getDBRouter();
        req.dbMetrics = router.getMetrics();
        next();
    };
}

/**
 * Middleware to ensure session consistency after writes
 * Auto-applied when using session tracking
 */
export function ensureConsistency() {
    return (req, res, next) => {
        const router = getDBRouter();
        const sessionId = req.session?.id || req.user?.id;
        
        if (sessionId) {
            router.markConsistencyWindow(sessionId);
            logger.debug('Ensuring consistency for session', { sessionId });
        }
        
        next();
    };
}

/**
 * Express error handler for database routing errors
 */
export function dbRoutingErrorHandler() {
    return (err, req, res, next) => {
        if (err.message && err.message.includes('database')) {
            logger.error('Database routing error', {
                error: err.message,
                path: req.path,
                method: req.method,
                sessionId: req.dbContext?.sessionId
            });

            return res.status(503).json({
                success: false,
                message: 'Database service temporarily unavailable',
                code: 'DB_UNAVAILABLE',
                error: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        }

        next(err);
    };
}

export default {
    attachDBConnection,
    forcePrimaryDB,
    criticalRead,
    attachDBMetrics,
    ensureConsistency,
    dbRoutingErrorHandler
};

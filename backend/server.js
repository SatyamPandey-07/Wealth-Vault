import express from "express";
import chatbotRoutes from "./routes/chatbot.routes.js";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger.js";
import { connectRedis } from "./config/redis.js";
import { scheduleCleanup } from "./jobs/tokenCleanup.js";
import { scheduleRatesSync, runImmediateSync } from "./jobs/syncRates.js";
import { initializeUploads } from "./middleware/fileUpload.js";
import outboxDispatcher from "./jobs/outboxDispatcher.js";
import certificateRotation from "./jobs/certificateRotation.js";
import "./services/sagaDefinitions.js"; // Register saga definitions
import { createFileServerRoute } from "./middleware/secureFileServer.js";
import {
  generalLimiter,
  aiLimiter,
  userLimiter,
} from "./middleware/rateLimiter.js";
import { requestIdMiddleware, requestLogger, errorLogger, analyticsMiddleware } from "./middleware/requestLogger.js";
import { auditLogger } from "./middleware/auditLogger.js";
import { performanceMiddleware } from "./services/performanceMonitor.js";
import { logInfo, logError } from "./utils/logger.js";
import { sanitizeInput, sanitizeMongo } from "./middleware/sanitizer.js";
import { responseWrapper } from "./middleware/responseWrapper.js";
import { paginationMiddleware } from "./utils/pagination.js";
import { notFound } from "./middleware/errorHandler.js";
import { globalErrorHandler } from "./middleware/globalErrorHandler.js";

// Import routes
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import expenseRoutes from "./routes/expenses.js";
import goalRoutes from "./routes/goals.js";
import categoryRoutes from "./routes/categories.js";
import geminiRouter from "./routes/gemini.js";
import analyticsRoutes from "./routes/analytics.js";
import healthRoutes from "./routes/health.js";
import performanceRoutes from "./routes/performance.js";
import tenantRoutes from "./routes/tenants.js";
import auditRoutes from "./routes/audit.js";
import servicesRoutes from "./routes/services.js";
import dbRouterRoutes from "./routes/dbRouter.js";

// Import DB Router
import { initializeDBRouter } from "./services/dbRouterService.js";
import { attachDBConnection, dbRoutingErrorHandler } from "./middleware/dbRouting.js";

// Load environment variables
dotenv.config();

// Initialize DB Router (with read/write split)
initializeDBRouter()
  .then(() => {
    console.log('🔄 DB Router initialized (read/write split enabled)');
  })
  .catch(err => {
    console.warn('⚠️ DB Router initialization failed, using primary only:', err.message);
  });

// Initialize Redis connection
connectRedis().catch((err) => {
  console.warn("⚠️ Redis connection failed, using memory-based rate limiting");
});

// Schedule token cleanup job
scheduleCleanup();

// Start outbox event dispatcher
outboxDispatcher.start();
console.log('📤 Outbox dispatcher started');

// Start certificate rotation job
certificateRotation.start();
console.log('🔐 Certificate rotation job started');

// Initiliz uplod directorys
initializeUploads().catch((err) => {
  console.error("❌ Failed to initialize upload directories:", err);
});

// Initialize Event Listeners
initializeBudgetListeners();
initializeNotificationListeners();
initializeAnalyticsListeners();
initializeSubscriptionListeners();
initializeSavingsListeners();
initializeAutopilotListeners();
initializeLiquidityListeners();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
// Configure Helmet with CORS-friendly settings
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  }),
);

// Configure CORS
app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3003",
        "http://127.0.0.1:3003",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        process.env.FRONTEND_URL,
      ].filter(Boolean);

      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Access-Control-Request-Method",
      "Access-Control-Request-Headers",
    ],
    exposedHeaders: ["Content-Range", "X-Content-Range", "Authorization"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }),
);
app.use(morgan("combined"));
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Security: Sanitize user input to prevent XSS and NoSQL injection
app.use(sanitizeMongo);
app.use(sanitizeInput);

// Response wrapper and pagination middleware
app.use(responseWrapper);
app.use(paginationMiddleware());

// Database routing middleware (read/write split)
app.use(attachDBConnection({
  enableSessionTracking: true,
  preferReplicas: process.env.PREFER_REPLICAS !== 'false'
}));

// Logng and monitrng midlware
app.use(requestIdMiddleware);
app.use(auditRequestIdMiddleware); // Add audit request correlation
app.use(requestLogger);
app.use(performanceMiddleware);
app.use(analyticsMiddleware);
app.use(auditLogger);

// Additional CORS headers middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
  } else {
    next();
  }
});

// Import database configuration
// Database configuration is handled via Drizzle in individual modules
console.log("📦 Database initialized via Drizzle");

// Apply general rate limiting to all API routes
app.use("/api", generalLimiter);

// Autopilot trigger interceptor — fires workflow events post-response
app.use("/api", triggerInterceptor);

// Swagger API Documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Wealth Vault API Docs",
  }),
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userLimiter, userRoutes);
app.use("/api/expenses", userLimiter, securityGuard, expenseRoutes);
app.use("/api/goals", userLimiter, goalRoutes);
app.use("/api/categories", userLimiter, categoryRoutes);
app.use("/api/analytics", userLimiter, analyticsRoutes);
app.use("/api/interlock", userLimiter, interlockRoutes);
// Apply presence tracker to all protected routes
app.use("/api", presenceTracker);
app.use("/api/vaults", userLimiter, vaultRoutes);
app.use("/api/budgets", userLimiter, budgetRoutes);
app.use("/api/expense-shares", userLimiter, expenseSharesRoutes);
app.use("/api/reimbursements", userLimiter, reimbursementsRoutes);
app.use("/api/interlock", userLimiter, interlockRoutes);
app.use("/api/reports", userLimiter, reportRoutes);
app.use("/api/private-debt", userLimiter, privateDebtRoutes);
app.use("/api/debts", userLimiter, debtRoutes);
app.use("/api/wallets", userLimiter, walletRoutes);
app.use("/api/fx", userLimiter, fxRoutes);
app.use("/api/forecasts", userLimiter, forecastRoutes);
app.use("/api/monte-carlo", userLimiter, monteCarloRoutes);
app.use("/api/gemini", aiLimiter, geminiRouter);
app.use("/api/health", healthRoutes);
app.use("/api/performance", userLimiter, performanceRoutes);
app.use("/api/tenants", userLimiter, tenantRoutes);
app.use("/api/audit", userLimiter, auditRoutes);
app.use("/api/db-router", userLimiter, dbRouterRoutes);


// Family Financial Planning routes
app.use("/api/family", userLimiter, familyRoutes);

// Secure file server for uploaded files
app.use("/uploads", createFileServerRoute());

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Wealth Vault API is running",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler for undefined routes (must be before error handler)
app.use(notFound);

// Add error logging middleware
app.use(errorLogger);

// DB routing error handler (must be before general error handler)
app.use(dbRoutingErrorHandler());

// Centralized error handling middleware (must be last)
app.use(globalErrorHandler);

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  cascadeMonitorJob.start();
  topologyGarbageCollector.start();
  wealthSimulationJob.start();
  app.listen(PORT, () => {
    logInfo('Server started successfully', {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000"
    });

    console.log(`🚀 Server running on port ${PORT}`);
    console.log(
      `📱 Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:3000"}`,
    );
    console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
    console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);

    // Start background jobs
    scheduleMonthlyReports();
    scheduleWeeklyHabitDigest();
    scheduleTaxReminders();
    scheduleRecoveryExpirationJob();
    subscriptionMonitor.initialize();
    fxRateSync.start();
    valuationUpdater.start();
    inactivityMonitor.start();
    taxEstimator.start();
    scheduleDebtStressTest();
    debtRecalculator.startScheduledJob();
    rateSyncer.start();
    forecastUpdater.start();
    riskAuditor.start();
    leaseMonitor.start();
    dividendProcessor.start();
    consolidationSync.start();
    recurringPaymentProcessor.start();
    categorizationTrainer.start();
    fxRateUpdater.start();
    liquidityOptimizerJob.start();
    arbitrageJob.start();
    riskMonitorJob.start();
    clearingJob.start();
    taxHarvestJob.start();
    scheduleTaxHarvestSync();
    initializeTaxListeners();
    riskBaselineJob.start();
    yieldMonitorJob.start();
    simulationJob.start();
    payoutMonitor.start();
    taxAuditJob.start();
    riskScanner.start();
    marketRateSyncJob.start();
    velocityJob.start();
    scheduleWorkflowDaemon();
    scheduleMacroDataSync();
    driftMonitor();
    scheduleLotReconciliation();
    scheduleStressTests();
    scheduleMarketOracle();
    schedulePrecomputePaths();
    scheduleResolutionCleanup();
    marketMonitor.start();
    volatilityMonitor.start();
    payrollCycleJob.start();
    mortalityDaemon.start();
    residencyAuditJob.start();
    scheduleOracleSync();
    liquiditySweepJob.init();
    interlockAccrualSync.init();
    thresholdMonitor.start();
    escrowValuationJob.start();
    hedgeDecayMonitor.start();
    liquidityRechargeJob.start();
    auditTrailSealer.start();
    taxHarvestScanner.start();
    washSaleExpirationJob.start();
    scheduleNightlySimulations();

    // Add debt services to app.locals for middleware/route access
    app.locals.debtEngine = debtEngine;
    app.locals.payoffOptimizer = payoffOptimizer;
    app.locals.refinanceScout = refinanceScout;

    // Initialize default tax categories and market indices
    initializeDefaultTaxCategories().catch(err => {
      console.warn('⚠️ Tax categories initialization skipped (may already exist):', err.message);
    });

    marketData.initializeDefaults().catch(err => {
      console.warn('⚠️ Market indices initialization skipped:', err.message);
    });
  });

  precomputePathsJob.start();
}

export default app;

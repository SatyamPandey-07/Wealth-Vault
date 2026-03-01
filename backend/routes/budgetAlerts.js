import express from 'express';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import db from '../config/db.js';
import { budgetAlerts, budgetRules, users, categories, vaults } from '../db/schema.js';
import { protect } from '../middleware/auth.js';
import notificationService from '../services/notificationService.js';
import budgetService from '../services/budgetService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { AppError } from '../utils/AppError.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);

/**
 * @swagger
 * /api/budget-alerts:
 *   get:
 *     summary: Get user's budget alerts
 *     tags: [Budget Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, triggered, all]
 *         default: active
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of budget alerts
 */
router.get('/', asyncHandler(async (req, res) => {
  const { status = 'active', limit = 20 } = req.query;
  const userId = req.user.id;

  let whereCondition = eq(budgetAlerts.userId, userId);

  if (status === 'triggered') {
    whereCondition = and(whereCondition, sql`${budgetAlerts.triggeredAt} IS NOT NULL`);
  } else if (status === 'active') {
    whereCondition = and(whereCondition, sql`${budgetAlerts.triggeredAt} IS NULL`);
  }

  const alerts = await db
    .select({
      id: budgetAlerts.id,
      threshold: budgetAlerts.threshold,
      period: budgetAlerts.period,
      triggeredAt: budgetAlerts.triggeredAt,
      metadata: budgetAlerts.metadata,
      category: {
        id: categories.id,
        name: categories.name,
        color: categories.color,
      },
      vault: {
        id: vaults.id,
        name: vaults.name,
      },
    })
    .from(budgetAlerts)
    .leftJoin(categories, eq(budgetAlerts.categoryId, categories.id))
    .leftJoin(vaults, eq(budgetAlerts.vaultId, vaults.id))
    .where(whereCondition)
    .orderBy(desc(budgetAlerts.triggeredAt || budgetAlerts.id))
    .limit(parseInt(limit));

  return new ApiResponse(200, alerts, 'Budget alerts retrieved successfully').send(res);
}));

/**
 * @swagger
 * /api/budget-alerts/rules:
 *   get:
 *     summary: Get user's budget rules
 *     tags: [Budget Rules]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of budget rules
 */
router.get('/rules', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const rules = await db
    .select({
      id: budgetRules.id,
      name: budgetRules.name,
      description: budgetRules.description,
      ruleType: budgetRules.ruleType,
      condition: budgetRules.condition,
      threshold: budgetRules.threshold,
      period: budgetRules.period,
      notificationType: budgetRules.notificationType,
      isActive: budgetRules.isActive,
      lastTriggered: budgetRules.lastTriggered,
      metadata: budgetRules.metadata,
      createdAt: budgetRules.createdAt,
      category: {
        id: categories.id,
        name: categories.name,
        color: categories.color,
      },
    })
    .from(budgetRules)
    .leftJoin(categories, eq(budgetRules.categoryId, categories.id))
    .where(and(eq(budgetRules.userId, userId), eq(budgetRules.isActive, true)))
    .orderBy(desc(budgetRules.createdAt));

  return new ApiResponse(200, rules, 'Budget rules retrieved successfully').send(res);
}));

/**
 * @swagger
 * /api/budget-alerts/rules:
 *   post:
 *     summary: Create a new budget rule
 *     tags: [Budget Rules]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [categoryId, name, ruleType, threshold, period, notificationType]
 *             properties:
 *               categoryId:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               ruleType:
 *                 type: string
 *                 enum: [percentage, amount, frequency]
 *               condition:
 *                 type: object
 *               threshold:
 *                 type: number
 *               period:
 *                 type: string
 *                 enum: [daily, weekly, monthly, yearly]
 *               notificationType:
 *                 type: string
 *                 enum: [email, push, in_app]
 *     responses:
 *       201:
 *         description: Budget rule created successfully
 */
router.post('/rules', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const {
    categoryId,
    name,
    description,
    ruleType,
    condition = {},
    threshold,
    period,
    notificationType
  } = req.body;

  // Validate required fields
  if (!categoryId || !name || !ruleType || !threshold || !period || !notificationType) {
    throw new AppError(400, 'Missing required fields');
  }

  // Validate category belongs to user
  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));

  if (!category) {
    throw new AppError(404, 'Category not found');
  }

  const newRule = await db.insert(budgetRules).values({
    userId,
    categoryId,
    name,
    description,
    ruleType,
    condition,
    threshold: threshold.toString(),
    period,
    notificationType,
  }).returning();

  return new ApiResponse(201, newRule[0], 'Budget rule created successfully').send(res);
}));

/**
 * @swagger
 * /api/budget-alerts/rules/{id}:
 *   put:
 *     summary: Update a budget rule
 *     tags: [Budget Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               threshold:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *               notificationType:
 *                 type: string
 *                 enum: [email, push, in_app]
 *     responses:
 *       200:
 *         description: Budget rule updated successfully
 */
router.put('/rules/:id', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const ruleId = req.params.id;
  const updates = req.body;

  // Validate rule belongs to user
  const [existingRule] = await db
    .select()
    .from(budgetRules)
    .where(and(eq(budgetRules.id, ruleId), eq(budgetRules.userId, userId)));

  if (!existingRule) {
    throw new AppError(404, 'Budget rule not found');
  }

  // Convert threshold to string if provided
  if (updates.threshold) {
    updates.threshold = updates.threshold.toString();
  }

  const updatedRule = await db
    .update(budgetRules)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(budgetRules.id, ruleId))
    .returning();

  return new ApiResponse(200, updatedRule[0], 'Budget rule updated successfully').send(res);
}));

/**
 * @swagger
 * /api/budget-alerts/rules/{id}:
 *   delete:
 *     summary: Delete a budget rule
 *     tags: [Budget Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Budget rule deleted successfully
 */
router.delete('/rules/:id', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const ruleId = req.params.id;

  // Validate rule belongs to user
  const [existingRule] = await db
    .select()
    .from(budgetRules)
    .where(and(eq(budgetRules.id, ruleId), eq(budgetRules.userId, userId)));

  if (!existingRule) {
    throw new AppError(404, 'Budget rule not found');
  }

  await db.delete(budgetRules).where(eq(budgetRules.id, ruleId));

  return new ApiResponse(200, null, 'Budget rule deleted successfully').send(res);
}));

/**
 * @swagger
 * /api/budget-alerts/{id}/dismiss:
 *   post:
 *     summary: Dismiss a budget alert
 *     tags: [Budget Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Alert dismissed successfully
 */
router.post('/:id/dismiss', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const alertId = req.params.id;

  // Validate alert belongs to user
  const [existingAlert] = await db
    .select()
    .from(budgetAlerts)
    .where(and(eq(budgetAlerts.id, alertId), eq(budgetAlerts.userId, userId)));

  if (!existingAlert) {
    throw new AppError(404, 'Budget alert not found');
  }

  // Mark as dismissed by updating metadata
  const updatedAlert = await db
    .update(budgetAlerts)
    .set({
      metadata: {
        ...existingAlert.metadata,
        dismissed: true,
        dismissedAt: new Date().toISOString()
      }
    })
    .where(eq(budgetAlerts.id, alertId))
    .returning();

  return new ApiResponse(200, updatedAlert[0], 'Budget alert dismissed successfully').send(res);
}));

/**
 * @swagger
 * /api/budget-alerts/test:
 *   post:
 *     summary: Test budget alert system (development only)
 *     tags: [Budget Alerts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [categoryId, amount]
 *             properties:
 *               categoryId:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Test alert triggered
 */
router.post('/test', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { categoryId, amount } = req.body;

  // Simulate expense data for testing
  const testExpense = {
    id: 'test-expense-id',
    userId,
    categoryId,
    amount,
    date: new Date()
  };

  // Trigger budget checking
  await budgetService.checkBudgetAfterExpense(testExpense);

  return new ApiResponse(200, null, 'Budget alert test completed').send(res);
}));

export default router;

/**
 * Tenant Management Routes
 * 
 * API endpoints for managing tenants, members, and team operations
 * All routes require authentication via protect middleware
 */

import express from 'express';
import { body, validationResult, param } from 'express-validator';
import { protect } from '../middleware/auth.js';
import {
  validateTenantAccess,
  requireTenantRole,
  extractTenantId
} from '../middleware/tenantMiddleware.js';
import {
  createTenant,
  getTenant,
  getUserTenants,
  addTenantMember,
  removeTenantMember,
  updateMemberRole,
  getTenantMembers,
  generateInviteToken,
  hasPermission,
  getTierFeatures
} from '../services/tenantService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// ============== TENANT MANAGEMENT ==============

/**
 * POST /api/tenants
 * Create a new tenant
 */
router.post(
  '/',
  protect,
  [
    body('name').notEmpty().withMessage('Tenant name is required'),
    body('description').optional().isString(),
    body('slug').optional().matches(/^[a-z0-9-]+$/).withMessage('Invalid slug format')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { name, description = '', slug, tier = 'free' } = req.body;

      const tenantData = {
        name,
        description,
        ownerId: req.user.id,
        tier,
        slug: slug ? slug.toLowerCase() : undefined
      };

      const { tenant, message } = await createTenant(tenantData);

      logger.info('Tenant created via API', {
        tenantId: tenant.id,
        userId: req.user.id
      });

      return res.status(201).json({
        success: true,
        message,
        data: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          tier: tenant.tier,
          createdAt: tenant.createdAt
        }
      });
    } catch (error) {
      logger.error('Error creating tenant:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error creating tenant'
      });
    }
  }
);

/**
 * GET /api/tenants
 * Get all tenants for current user
 */
router.get('/', protect, async (req, res) => {
  try {
    const tenants = await getUserTenants(req.user.id);

    return res.status(200).json({
      success: true,
      data: tenants.map(t => ({
        id: t.tenant.id,
        name: t.tenant.name,
        slug: t.tenant.slug,
        tier: t.tenant.tier,
        role: t.role,
        joinedAt: t.joinedAt
      }))
    });
  } catch (error) {
    logger.error('Error fetching user tenants:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching tenants'
    });
  }
});

/**
 * GET /api/tenants/:tenantId
 * Get tenant details
 */
router.get(
  '/:tenantId',
  protect,
  validateTenantAccess,
  async (req, res) => {
    try {
      const tenant = await getTenant(req.params.tenantId);

      return res.status(200).json({
        success: true,
        data: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          description: tenant.description,
          tier: tenant.tier,
          features: tenant.features,
          settings: tenant.settings,
          memberCount: tenant.memberCount,
          maxMembers: tenant.maxMembers,
          createdAt: tenant.createdAt,
          updatedAt: tenant.updatedAt
        }
      });
    } catch (error) {
      logger.error('Error fetching tenant:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching tenant'
      });
    }
  }
);

/**
 * PUT /api/tenants/:tenantId
 * Update tenant (owner/admin only)
 */
router.put(
  '/:tenantId',
  protect,
  validateTenantAccess,
  requireTenantRole(['owner', 'admin']),
  [
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('description').optional().isString(),
    body('settings').optional().isObject()
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { name, description, settings } = req.body;
      
      // TODO: Implement update logic with Drizzle update
      return res.status(200).json({
        success: true,
        message: 'Tenant updated successfully'
      });
    } catch (error) {
      logger.error('Error updating tenant:', error);
      return res.status(500).json({
        success: false,
        message: 'Error updating tenant'
      });
    }
  }
);

// ============== MEMBER MANAGEMENT ==============

/**
 * GET /api/tenants/:tenantId/members
 * Get all tenant members
 */
router.get(
  '/:tenantId/members',
  protect,
  validateTenantAccess,
  async (req, res) => {
    try {
      const members = await getTenantMembers(req.params.tenantId);

      return res.status(200).json({
        success: true,
        data: members
      });
    } catch (error) {
      logger.error('Error fetching tenant members:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching members'
      });
    }
  }
);

/**
 * POST /api/tenants/:tenantId/members
 * Add member to tenant (admin/owner only)
 */
router.post(
  '/:tenantId/members',
  protect,
  validateTenantAccess,
  requireTenantRole(['owner', 'admin']),
  [
    body('userId').isUUID().withMessage('Invalid user ID'),
    body('role')
      .optional()
      .isIn(['member', 'manager', 'viewer'])
      .withMessage('Invalid role')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { userId, role = 'member' } = req.body;

      const member = await addTenantMember(req.params.tenantId, userId, role);

      logger.info('Member added to tenant via API', {
        tenantId: req.params.tenantId,
        userId,
        requestedBy: req.user.id
      });

      return res.status(201).json({
        success: true,
        message: 'Member added successfully',
        data: {
          userId: member.userId,
          role: member.role,
          joinedAt: member.joinedAt
        }
      });
    } catch (error) {
      logger.error('Error adding member:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error adding member'
      });
    }
  }
);

/**
 * PUT /api/tenants/:tenantId/members/:userId/role
 * Update member role (owner/admin only)
 */
router.put(
  '/:tenantId/members/:userId/role',
  protect,
  validateTenantAccess,
  requireTenantRole(['owner', 'admin']),
  [
    body('role')
      .isIn(['member', 'manager', 'admin', 'viewer'])
      .withMessage('Invalid role')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { role } = req.body;

      const updated = await updateMemberRole(req.params.tenantId, req.params.userId, role);

      logger.info('Member role updated via API', {
        tenantId: req.params.tenantId,
        userId: req.params.userId,
        newRole: role,
        updatedBy: req.user.id
      });

      return res.status(200).json({
        success: true,
        message: 'Member role updated successfully',
        data: {
          role: updated.role
        }
      });
    } catch (error) {
      logger.error('Error updating member role:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error updating role'
      });
    }
  }
);

/**
 * DELETE /api/tenants/:tenantId/members/:userId
 * Remove member from tenant (owner/admin only)
 */
router.delete(
  '/:tenantId/members/:userId',
  protect,
  validateTenantAccess,
  requireTenantRole(['owner', 'admin']),
  async (req, res) => {
    try {
      await removeTenantMember(req.params.tenantId, req.params.userId);

      logger.info('Member removed from tenant via API', {
        tenantId: req.params.tenantId,
        userId: req.params.userId,
        removedBy: req.user.id
      });

      return res.status(200).json({
        success: true,
        message: 'Member removed successfully'
      });
    } catch (error) {
      logger.error('Error removing member:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error removing member'
      });
    }
  }
);

// ============== INVITE MANAGEMENT ==============

/**
 * POST /api/tenants/:tenantId/invite
 * Generate invite link for new member
 */
router.post(
  '/:tenantId/invite',
  protect,
  validateTenantAccess,
  requireTenantRole(['owner', 'admin']),
  [
    body('email').isEmail().withMessage('Invalid email address')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { email } = req.body;

      const { token, inviteLink } = await generateInviteToken(req.params.tenantId, email);

      logger.info('Invite generated', {
        tenantId: req.params.tenantId,
        email,
        generatedBy: req.user.id
      });

      return res.status(200).json({
        success: true,
        message: 'Invite generated successfully',
        data: {
          inviteLink,
          expiresIn: '7 days'
        }
      });
    } catch (error) {
      logger.error('Error generating invite:', error);
      return res.status(500).json({
        success: false,
        message: 'Error generating invite'
      });
    }
  }
);

// ============== TENANT SETTINGS ==============

/**
 * GET /api/tenants/:tenantId/features
 * Get available features for tenant's tier
 */
router.get(
  '/:tenantId/features',
  protect,
  validateTenantAccess,
  async (req, res) => {
    try {
      const tenant = await getTenant(req.params.tenantId);
      const features = getTierFeatures(tenant.tier);

      return res.status(200).json({
        success: true,
        data: {
          tier: tenant.tier,
          features
        }
      });
    } catch (error) {
      logger.error('Error fetching features:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching features'
      });
    }
  }
);

/**
 * GET /api/tenants/:tenantId/usage
 * Get tenant usage statistics
 */
router.get(
  '/:tenantId/usage',
  protect,
  validateTenantAccess,
  async (req, res) => {
    try {
      const tenant = await getTenant(req.params.tenantId);
      const members = await getTenantMembers(req.params.tenantId);

      return res.status(200).json({
        success: true,
        data: {
          members: {
            current: members.length,
            max: tenant.maxMembers
          },
          tier: tenant.tier,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error fetching usage:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching usage'
      });
    }
  }
);

export default router;

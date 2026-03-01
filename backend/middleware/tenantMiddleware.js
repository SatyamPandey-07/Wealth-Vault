/**
 * Tenant Isolation Middleware
 * 
 * Enforces multi-tenant data isolation and ensures users only access
 * their own tenant's data.
 */

import { eq, and } from 'drizzle-orm';
import db from '../config/db.js';
import { tenants, tenantMembers, users } from '../db/schema.js';
import { logger } from '../utils/logger.js';

/**
 * Extract tenant ID from request (URL param or header)
 */
export const extractTenantId = (req) => {
  // Priority: URL param > query param > context header
  return req.params.tenantId || req.query.tenantId || req.headers['x-tenant-id'];
};

/**
 * Validate tenant access and attach tenant context to request
 * Should be used after protect middleware
 */
export const validateTenantAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }

    const tenantId = extractTenantId(req);

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required',
        code: 'MISSING_TENANT_ID'
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenant ID format',
        code: 'INVALID_TENANT_ID'
      });
    }

    // Check if tenant exists
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    if (!tenant) {
      logger.warn(`Attempted access to non-existent tenant: ${tenantId}`, {
        userId: req.user.id,
        tenantId
      });
      return res.status(404).json({
        success: false,
        message: 'Tenant not found',
        code: 'TENANT_NOT_FOUND'
      });
    }

    if (tenant.status === 'deleted') {
      return res.status(410).json({
        success: false,
        message: 'Tenant has been deleted',
        code: 'TENANT_DELETED'
      });
    }

    if (tenant.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Tenant is suspended',
        code: 'TENANT_SUSPENDED'
      });
    }

    // Check tenant membership and permissions
    const [membership] = await db
      .select()
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.tenantId, tenantId),
          eq(tenantMembers.userId, req.user.id)
        )
      );

    if (!membership) {
      logger.warn(`User attempted unauthorized tenant access`, {
        userId: req.user.id,
        tenantId
      });
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this tenant',
        code: 'FORBIDDEN'
      });
    }

    if (membership.status === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Your membership is pending',
        code: 'MEMBERSHIP_PENDING'
      });
    }

    if (membership.status === 'deleted') {
      return res.status(403).json({
        success: false,
        message: 'Your membership has been revoked',
        code: 'MEMBERSHIP_REVOKED'
      });
    }

    // Attach tenant context to request
    req.tenant = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      tier: tenant.tier,
      features: tenant.features,
      settings: tenant.settings,
      ownerId: tenant.ownerId
    };

    req.tenantMembership = {
      id: membership.id,
      role: membership.role,
      permissions: membership.permissions,
      joinedAt: membership.joinedAt
    };

    next();
  } catch (error) {
    logger.error('Tenant validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Tenant validation failed',
      code: 'TENANT_VALIDATION_ERROR'
    });
  }
};

/**
 * Require specific tenant role
 */
export const requireTenantRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.tenantMembership) {
      return res.status(401).json({
        success: false,
        message: 'Tenant context not found',
        code: 'NO_TENANT_CONTEXT'
      });
    }

    if (!allowedRoles.includes(req.tenantMembership.role)) {
      logger.warn(`Unauthorized role access attempt`, {
        userId: req.user?.id,
        tenantId: req.tenant?.id,
        requiredRoles: allowedRoles,
        userRole: req.tenantMembership.role
      });
      return res.status(403).json({
        success: false,
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
        code: 'INSUFFICIENT_ROLE'
      });
    }

    next();
  };
};

/**
 * Build tenant-aware query filter
 * Use in route handlers to ensure only tenant data is returned
 */
export const getTenantFilter = (tenantId, userIdColumn = null) => {
  return {
    tenantFilter: eq(tenantId),
    userFilter: userIdColumn ? eq(userIdColumn) : null
  };
};

/**
 * Middleware to ensure query results belong to current tenant
 * Validates array of objects have correct tenant_id
 */
export const validateTenantDataOwnership = (req, res, next) => {
  req.validateTenantOwnership = (data) => {
    if (!Array.isArray(data)) {
      data = [data];
    }

    return data.every(item => {
      if (!item || !item.tenantId) return false;
      return item.tenantId === req.tenant.id;
    });
  };

  next();
};

/**
 * Tenant rate limiting - limit by tenant, not just IP
 */
export const getTenantRateLimitKey = (req) => {
  return req.tenant?.id || req.user?.id || req.ip;
};

export default {
  validateTenantAccess,
  requireTenantRole,
  extractTenantId,
  getTenantFilter,
  validateTenantDataOwnership,
  getTenantRateLimitKey
};

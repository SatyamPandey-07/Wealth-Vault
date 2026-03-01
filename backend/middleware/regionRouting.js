import { buildRoutingDecision, extractTenantRegionConfig, isDataClassRestricted } from '../services/multiRegionService.js';
import { logger } from '../utils/logger.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const enforceTenantRegionRouting = (options = {}) => {
  const {
    strictWhenEnabled = true,
    allowReadRedirect = true,
    enabled = process.env.ENABLE_REGION_ROUTING === 'true'
  } = options;

  return (req, res, next) => {
    if (!enabled || !req.tenant) {
      return next();
    }

    const requestRegion = req.headers['x-region'] || req.headers['x-app-region'] || process.env.APP_REGION;
    const decision = buildRoutingDecision({
      tenant: req.tenant,
      requestRegion,
      method: req.method
    });

    req.regionRouting = decision;

    res.setHeader('X-Tenant-Home-Region', decision.homeRegion);
    res.setHeader('X-Request-Region', decision.requestRegion);
    res.setHeader('X-Region-Routing-Reason', decision.reason);

    if (!decision.allow && strictWhenEnabled) {
      logger.warn('Tenant region routing blocked request', {
        tenantId: req.tenant.id,
        method: req.method,
        path: req.originalUrl,
        homeRegion: decision.homeRegion,
        requestRegion: decision.requestRegion,
        reason: decision.reason
      });

      const isRead = !WRITE_METHODS.has(String(req.method || 'GET').toUpperCase());

      if (allowReadRedirect && isRead) {
        return res.status(307).json({
          success: false,
          message: 'Request must be served from tenant home region',
          code: 'REGION_REDIRECT_REQUIRED',
          homeRegion: decision.homeRegion,
          requestRegion: decision.requestRegion,
          reason: decision.reason
        });
      }

      return res.status(409).json({
        success: false,
        message: 'Cross-region request blocked by residency policy',
        code: 'REGION_POLICY_BLOCKED',
        homeRegion: decision.homeRegion,
        requestRegion: decision.requestRegion,
        reason: decision.reason
      });
    }

    return next();
  };
};

export const enforceResidencyDataClass = () => {
  return (req, res, next) => {
    if (!req.tenant) {
      return next();
    }

    const dataClass = String(req.headers['x-data-class'] || req.body?.dataClass || 'operational').toLowerCase();
    const requestRegion = req.headers['x-region'] || process.env.APP_REGION || null;
    const { homeRegion } = extractTenantRegionConfig(req.tenant);

    if (requestRegion && requestRegion !== homeRegion && isDataClassRestricted(req.tenant, dataClass)) {
      logger.warn('Residency-restricted data blocked outside home region', {
        tenantId: req.tenant.id,
        dataClass,
        requestRegion,
        homeRegion,
        path: req.originalUrl,
        method: req.method
      });

      return res.status(409).json({
        success: false,
        message: 'Residency-restricted data must remain in tenant home region',
        code: 'RESIDENCY_DATA_BLOCKED',
        dataClass,
        homeRegion,
        requestRegion
      });
    }

    return next();
  };
};

export default {
  enforceTenantRegionRouting,
  enforceResidencyDataClass
};

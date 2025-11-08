import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Tenant Isolation Middleware
 * 
 * This middleware ensures data isolation between companies:
 * 1. Extracts user's companyId from JWT token
 * 2. Attaches it to the request object
 * 3. Blocks access if company is suspended
 * 4. Super admins bypass company checks
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  async use(req: Request & { user?: any; companyId?: string }, res: Response, next: NextFunction) {
    // Skip if no user (public routes)
    if (!req.user) {
      return next();
    }

    const user = req.user;

    // SUPER_ADMIN has no companyId and can access all data
    if (user.role === 'SUPER_ADMIN') {
      req.companyId = null; // Explicitly null for super admin
      return next();
    }

    // All other users must have a companyId
    if (!user.companyId) {
      throw new ForbiddenException('User is not associated with any company');
    }

    // Attach companyId to request for easy access in services
    req.companyId = user.companyId;

    // TODO: Check if company is active/not suspended
    // This would require a database call, consider caching

    next();
  }
}


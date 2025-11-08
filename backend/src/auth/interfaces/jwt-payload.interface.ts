import { UserRole } from '../../types/prisma';

export interface JwtPayload {
  sub: string; // User ID
  email: string;
  role: UserRole;
  companyId?: string; // NULL for SUPER_ADMIN, required for others
  iat?: number;
  exp?: number;
}

// Prisma enum types
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',     // System administrator - manages all companies
  COMPANY_ADMIN = 'COMPANY_ADMIN', // Company administrator - manages their company
  ADMIN = 'ADMIN',                 // Department admin
  EMPLOYEE = 'EMPLOYEE',           // Regular user
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  AWAY = 'AWAY',
  OFFLINE = 'OFFLINE',
  RETIRED = 'RETIRED',
}

export enum TaskPhase {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}


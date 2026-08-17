import { IsString, IsBoolean, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for creating a phase within a workflow.
 * Note: The 'order' field is automatically determined by the backend based on array position.
 * Do not include 'order' in requests - it will be rejected.
 */
export class CreatePhaseDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedRoles?: string[]; // DEPRECATED: Use allowedUserIds instead

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedUserIds?: string[]; // User IDs who can access this phase

  @IsOptional()
  @IsString()
  autoAssignRole?: string; // DEPRECATED: Use autoAssignUserId instead

  @IsOptional()
  @IsString()
  autoAssignUserId?: string; // Specific user ID to auto-assign

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsString()
  color?: string;
}

/**
 * DTO for creating a complete workflow with phases.
 * The workflow system will automatically:
 * - Set phase order based on array position
 * - Create the first phase as starting phase (isStartPhase=true)
 * - Create the last phase as ending phase (isEndPhase=true)
 */
export class CreateWorkflowDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  taskType: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  color?: string;

  /**
   * The department this workflow belongs to. Omit or null for the whole company, which
   * is what every workflow made before this field existed is.
   */
  @IsOptional()
  @IsString()
  departmentId?: string | null;

  /**
   * Teams inside that department allowed to use it. Empty means the whole department.
   * Meaningless without a departmentId, and ignored in that case rather than rejected,
   * so a half-filled form does not fail on a field the person cannot see the point of.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  teamIds?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePhaseDto)
  phases: CreatePhaseDto[];

  /**
   * Where the tasks go when a phase is removed: removed phase id → surviving phase id.
   *
   * Only read on update, and only for phases that actually hold tasks. An untyped
   * object because the keys are ids rather than a fixed shape; the service validates
   * every entry against the phases that are surviving.
   */
  @IsOptional()
  reassign?: Record<string, string>;
}


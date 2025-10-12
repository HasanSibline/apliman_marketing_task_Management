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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePhaseDto)
  phases: CreatePhaseDto[];
}


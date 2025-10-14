import { 
  IsString, 
  IsOptional, 
  IsInt, 
  Min, 
  Max,
  IsDateString,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({
    description: 'Task title',
    example: 'Create social media campaign for aïda platform launch',
  })
  @IsString()
  @MinLength(3, { message: 'Title must be at least 3 characters long' })
  title: string;

  @ApiProperty({
    description: 'Task description',
    example: 'Create comprehensive social media campaign highlighting aïda AI features',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Task goals set by admin',
    example: 'Complete authentication system with proper error handling and security measures',
    required: false,
  })
  @IsOptional()
  @IsString()
  goals?: string;

  @ApiProperty({
    description: 'Task priority (1-5 scale)',
    example: 3,
    minimum: 1,
    maximum: 5,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Priority must be between 1 and 5' })
  @Max(5, { message: 'Priority must be between 1 and 5' })
  priority?: number;

  @ApiProperty({
    description: 'Task due date',
    example: '2024-12-31T23:59:59.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString({}, { message: 'Due date must be a valid ISO date string' })
  dueDate?: string;

  @ApiProperty({
    description: 'ID of user to assign task to (for backward compatibility)',
    example: 'uuid-string',
    required: false,
  })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiProperty({
    description: 'Array of user IDs to assign task to',
    example: ['uuid-string-1', 'uuid-string-2'],
    required: false,
  })
  @IsOptional()
  @IsString({ each: true })
  assignedUserIds?: string[];

  @ApiProperty({
    description: 'Workflow ID to use (optional, will auto-detect if not provided)',
    example: 'uuid-string',
    required: false,
  })
  @IsOptional()
  @IsString()
  workflowId?: string;

  @ApiProperty({
    description: 'Whether to generate subtasks using AI',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  generateSubtasks?: boolean;

  @ApiProperty({
    description: 'Whether to auto-assign subtasks based on roles',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  autoAssign?: boolean;

  @ApiProperty({
    description: 'Pre-generated subtasks from AI (if user edited them in the modal)',
    example: [{
      title: 'Research content',
      description: 'Research and gather content for the post',
      phaseName: 'Research',
      suggestedRole: 'Content Writer',
      suggestedUserId: 'uuid-string',
      assignedToId: 'uuid-string',
      estimatedHours: 2
    }],
    required: false,
  })
  @IsOptional()
  aiSubtasks?: Array<{
    title: string;
    description: string;
    phaseName?: string;
    suggestedRole?: string;
    suggestedUserId?: string;
    suggestedUserName?: string;
    assignedToId?: string;
    estimatedHours?: number;
  }>;
}

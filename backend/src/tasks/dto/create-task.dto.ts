import { 
  IsString, 
  IsOptional, 
  IsEnum, 
  IsInt, 
  Min, 
  Max,
  IsDateString,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaskPhase } from '../../types/prisma';

export class CreateTaskDto {
  @ApiProperty({
    description: 'Task title',
    example: 'Implement user authentication',
  })
  @IsString()
  @MinLength(3, { message: 'Title must be at least 3 characters long' })
  title: string;

  @ApiProperty({
    description: 'Task description',
    example: 'Implement JWT-based authentication system with role-based access control',
  })
  @IsString()
  @MinLength(10, { message: 'Description must be at least 10 characters long' })
  description: string;

  @ApiProperty({
    description: 'Task phase',
    enum: TaskPhase,
    example: TaskPhase.PENDING_APPROVAL,
    required: false,
  })
  @IsOptional()
  @IsEnum(TaskPhase, { message: 'Phase must be a valid TaskPhase' })
  phase?: TaskPhase;

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
    description: 'ID of user to assign task to',
    example: 'uuid-string',
    required: false,
  })
  @IsOptional()
  @IsString()
  assignedToId?: string;
}

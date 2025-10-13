import { IsString, IsOptional, IsNumber, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddSubtaskDto {
  @ApiProperty({
    description: 'Subtask title',
    example: 'Design Instagram post mockup',
  })
  @IsString()
  @MinLength(1, { message: 'Title cannot be empty' })
  title: string;

  @ApiProperty({
    description: 'Subtask description',
    example: 'Create 3 design variations for the new product launch',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'User ID to assign the subtask to',
    example: 'user-id-123',
    required: false,
  })
  @IsString()
  @IsOptional()
  assignedToId?: string;

  @ApiProperty({
    description: 'Estimated hours to complete',
    example: 2.5,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  estimatedHours?: number;

  @ApiProperty({
    description: 'Phase ID for the subtask',
    example: 'phase-id-123',
    required: false,
  })
  @IsString()
  @IsOptional()
  phaseId?: string;
}


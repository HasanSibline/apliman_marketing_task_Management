import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckCompletenessDto {
  @ApiProperty({
    description: 'Task description',
    example: 'Implement JWT-based authentication system with role-based access control',
  })
  @IsString()
  description: string;

  @ApiProperty({
    description: 'Task goals set by admin',
    example: 'Complete authentication system with proper error handling and security measures',
  })
  @IsString()
  goals: string;

  @ApiProperty({
    description: 'Current task phase',
    example: 'IN_PROGRESS',
  })
  @IsString()
  phase: string;
}

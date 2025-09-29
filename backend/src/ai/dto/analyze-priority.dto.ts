import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnalyzePriorityDto {
  @ApiProperty({
    description: 'Task title',
    example: 'Implement user authentication',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Task description',
    example: 'Implement JWT-based authentication system with role-based access control',
  })
  @IsString()
  description: string;
}

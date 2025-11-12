import { 
  IsEmail, 
  IsString, 
  MinLength, 
  IsEnum, 
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../types/prisma';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@company.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
  })
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  name: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecurePass123!',
  })
  @IsString()
  password: string;

  @ApiProperty({
    description: 'User role',
    enum: UserRole,
    example: UserRole.EMPLOYEE,
  })
  @IsEnum(UserRole, { message: 'Role must be SUPER_ADMIN, COMPANY_ADMIN, ADMIN, or EMPLOYEE' })
  role: UserRole;

  @ApiProperty({
    description: 'User position/job title',
    example: 'Software Developer',
    required: false,
  })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiProperty({
    description: 'Associated company ID (required for company users)',
    example: 'd5e8a2b1-1234-4cde-9f67-abcdef123456',
    required: false,
  })
  @IsOptional()
  @IsString()
  companyId?: string;
}


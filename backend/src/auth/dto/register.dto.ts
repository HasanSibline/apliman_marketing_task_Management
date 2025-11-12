import { 
  IsEmail, 
  IsString, 
  MinLength, 
  IsEnum, 
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../types/prisma';

export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'newuser@company.com',
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
    description: 'User password (min 8 chars, must contain uppercase, lowercase, number, and special character)',
    example: 'SecurePass123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    },
  )
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
    description: 'Associated company ID (required when creating company-specific users as Super Admin)',
    example: 'd5e8a2b1-1234-4cde-9f67-abcdef123456',
    required: false,
  })
  @IsOptional()
  @IsString()
  companyId?: string;
}

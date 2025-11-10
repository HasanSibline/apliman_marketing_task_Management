import { IsString, IsEmail, IsOptional, IsInt, IsEnum, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Acme Corporation', description: 'Company name' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'acme', description: 'URL-friendly slug' })
  @IsString()
  slug: string;

  @ApiProperty({ example: 'admin@acme.com', description: 'Company admin email' })
  @IsEmail()
  adminEmail: string;

  @ApiProperty({ example: 'Admin Name', description: 'Company admin name' })
  @IsString()
  adminName: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Company admin password', required: false })
  @IsOptional()
  @IsString()
  adminPassword?: string; // Auto-generated if not provided

  @ApiProperty({ example: 'FREE', enum: ['FREE', 'PRO', 'ENTERPRISE'], description: 'Subscription plan' })
  @IsEnum(['FREE', 'PRO', 'ENTERPRISE'])
  subscriptionPlan: string;

  @ApiProperty({ example: 30, description: 'Subscription duration in days', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  subscriptionDays?: number;

  @ApiProperty({ example: 'data:image/png;base64,...', description: 'Company logo (base64)', required: false })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({ example: '#3B82F6', description: 'Primary brand color', required: false })
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ApiProperty({ example: 10, description: 'Maximum number of users', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers?: number;

  @ApiProperty({ example: 1000, description: 'Maximum number of tasks', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTasks?: number;

  @ApiProperty({ example: 5, description: 'Maximum storage in GB', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxStorage?: number;

  @ApiProperty({ example: 'YOUR_API_KEY_HERE', description: 'AI API key (Gemini/OpenAI)', required: false })
  @IsOptional()
  @IsString()
  aiApiKey?: string;

  @ApiProperty({ example: 'gemini', enum: ['gemini', 'openai'], description: 'AI provider', required: false })
  @IsOptional()
  @IsEnum(['gemini', 'openai'])
  aiProvider?: string;

  @ApiProperty({ example: 'billing@company.com', description: 'Billing email', required: false })
  @IsOptional()
  @IsEmail()
  billingEmail?: string;
}


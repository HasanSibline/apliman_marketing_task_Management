import { IsString, IsOptional, IsInt, IsEnum, IsBoolean, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCompanyDto {
  @ApiProperty({ example: 'Apliman Marketing Updated', description: 'Company name', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'data:image/png;base64,...', description: 'Company logo (base64)', required: false })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({ example: '#3B82F6', description: 'Primary brand color', required: false })
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ApiProperty({ example: true, description: 'Company active status', required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: 'PRO', enum: ['FREE', 'PRO', 'ENTERPRISE'], description: 'Subscription plan', required: false })
  @IsOptional()
  @IsEnum(['FREE', 'PRO', 'ENTERPRISE'])
  subscriptionPlan?: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['ACTIVE', 'TRIAL', 'EXPIRED', 'SUSPENDED'], description: 'Subscription status', required: false })
  @IsOptional()
  @IsEnum(['ACTIVE', 'TRIAL', 'EXPIRED', 'SUSPENDED'])
  subscriptionStatus?: string;

  @ApiProperty({ example: 99, description: 'Monthly price', required: false })
  @IsOptional()
  monthlyPrice?: number;

  @ApiProperty({ example: 25, description: 'Maximum number of users', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers?: number;

  @ApiProperty({ example: 5000, description: 'Maximum number of tasks', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTasks?: number;

  @ApiProperty({ example: 10, description: 'Maximum storage in GB', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxStorage?: number;

  @ApiProperty({ example: 'YOUR_NEW_API_KEY', description: 'AI API key', required: false })
  @IsOptional()
  @IsString()
  aiApiKey?: string;

  @ApiProperty({ example: 'openai', enum: ['gemini', 'openai'], description: 'AI provider', required: false })
  @IsOptional()
  @IsEnum(['gemini', 'openai'])
  aiProvider?: string;

  @ApiProperty({ example: false, description: 'AI enabled status', required: false })
  @IsOptional()
  @IsBoolean()
  aiEnabled?: boolean;
}


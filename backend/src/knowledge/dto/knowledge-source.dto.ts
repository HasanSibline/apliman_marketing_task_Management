import { IsString, IsEnum, IsOptional, IsBoolean, IsInt, Min, Max, IsUrl } from 'class-validator';

export enum KnowledgeSourceType {
  APLIMAN = 'APLIMAN',
  COMPETITOR = 'COMPETITOR',
}

export class CreateKnowledgeSourceDto {
  @IsString()
  name: string;

  @IsUrl()
  url: string;

  @IsEnum(KnowledgeSourceType)
  type: KnowledgeSourceType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;
}

export class UpdateKnowledgeSourceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsEnum(KnowledgeSourceType)
  type?: KnowledgeSourceType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;
}


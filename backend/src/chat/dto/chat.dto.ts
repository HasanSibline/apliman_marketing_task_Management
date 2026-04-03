import { IsString, IsOptional, IsBoolean, IsArray, IsObject, Allow, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class FileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  base64?: string;
}

export class SendMessageDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsObject()
  metadata?: any;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FileDto)
  files?: FileDto[];
}

export class CreateSessionDto {
  @IsOptional()
  @IsString()
  title?: string;
}

export class UpdateContextDto {
  @IsObject()
  contextData: any;
}

export class ChatQueryDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userMentions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  taskReferences?: string[];

  @IsOptional()
  @IsBoolean()
  deepAnalysis?: boolean;
}


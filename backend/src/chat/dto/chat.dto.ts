import { IsString, IsOptional, IsBoolean, IsArray, IsObject } from 'class-validator';

export class SendMessageDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsObject()
  metadata?: any;
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


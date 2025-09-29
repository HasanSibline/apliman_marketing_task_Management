import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SummarizeTextDto {
  @ApiProperty({
    description: 'Text to summarize',
    example: 'This is a long text that needs to be summarized...',
  })
  @IsString()
  text: string;

  @ApiProperty({
    description: 'Maximum length of summary',
    example: 150,
    required: false,
    minimum: 50,
    maximum: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(500)
  maxLength?: number;
}

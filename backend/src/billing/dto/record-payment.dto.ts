import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RecordPaymentDto {
  @ApiProperty({ example: 99, description: 'Amount received, in USD' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: 1, description: 'Months of subscription this payment covers' })
  @IsInt()
  @Min(1)
  @Max(36)
  months: number;

  @ApiProperty({ example: '2026-11-10', description: 'When the payment was received. Defaults to now.', required: false })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiProperty({ example: 'Bank transfer', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  method?: string;

  @ApiProperty({ example: 'TRX-88213', description: 'Bank or receipt reference', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ example: 'PRO', required: false, description: 'Move the company to this plan with the payment, e.g. a trial converting to PRO' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  plan?: string; // checked against the plans table by the service
}

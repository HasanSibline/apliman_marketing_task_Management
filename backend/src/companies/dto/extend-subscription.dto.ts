import { IsString, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExtendSubscriptionDto {
  @ApiProperty({ example: 30, description: 'Number of days to extend subscription' })
  @IsInt()
  @Min(1)
  days: number;

  @ApiProperty({ example: 'Customer requested extension', description: 'Reason for extension' })
  @IsString()
  reason: string;
}


import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CloseQuarterDto {
    @ApiProperty({ description: 'Task IDs to roll over to the next quarter', type: [String] })
    @IsArray()
    @IsString({ each: true })
    rolloverTaskIds: string[];

    @ApiProperty({ description: 'ID of the next quarter to roll tasks into', required: false })
    @IsOptional()
    @IsString()
    nextQuarterId?: string;
}

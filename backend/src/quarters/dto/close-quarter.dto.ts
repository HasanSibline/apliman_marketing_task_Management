import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';
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

    @ApiProperty({
        description:
            'Park the carried tasks outside any quarter. Without this the successor is used, so work follows the company forward by default.',
        required: false,
    })
    @IsOptional()
    @IsBoolean()
    leaveUnscheduled?: boolean;
}

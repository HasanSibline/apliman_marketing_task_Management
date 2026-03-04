import { IsString, IsInt, IsDateString, IsEnum, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateQuarterDto {
    @ApiProperty({ example: 'Q1' })
    @IsString()
    name: string;

    @ApiProperty({ example: 2025 })
    @IsInt()
    @Min(2020)
    @Max(2100)
    year: number;

    @ApiProperty({ example: '2025-01-01' })
    @IsDateString()
    startDate: string;

    @ApiProperty({ example: '2025-03-31' })
    @IsDateString()
    endDate: string;

    @ApiProperty({ enum: ['UPCOMING', 'ACTIVE', 'CLOSED'], required: false })
    @IsOptional()
    @IsEnum(['UPCOMING', 'ACTIVE', 'CLOSED'])
    status?: string;
}

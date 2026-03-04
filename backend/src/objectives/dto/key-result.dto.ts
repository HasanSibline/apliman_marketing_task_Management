import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateKeyResultDto {
    @ApiProperty()
    @IsString()
    title: string;

    @ApiProperty({ default: 'number', required: false })
    @IsOptional()
    @IsString()
    unit?: string;

    @ApiProperty({ default: 0 })
    @IsNumber()
    @Min(0)
    startValue: number;

    @ApiProperty()
    @IsNumber()
    targetValue: number;

    @ApiProperty({ default: 0, required: false })
    @IsOptional()
    @IsNumber()
    @Min(0)
    currentValue?: number;
}

export class UpdateKeyResultDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    title?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    currentValue?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    targetValue?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    unit?: string;
}

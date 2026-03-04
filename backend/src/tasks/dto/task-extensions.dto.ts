import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddDependencyDto {
    @ApiProperty({ description: 'ID of the task that must be completed first (blocker)' })
    @IsString()
    blockerId: string;
}

export class AssignQuarterDto {
    @ApiProperty({ description: 'ID of the quarter to assign to (null to unassign)', required: false })
    @IsString()
    quarterId: string;
}

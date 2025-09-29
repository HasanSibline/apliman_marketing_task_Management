import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({
    description: 'Comment text',
    example: 'Please review the implementation and provide feedback',
  })
  @IsString()
  @MinLength(1, { message: 'Comment cannot be empty' })
  comment: string;
}

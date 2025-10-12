import { IsString, MinLength, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({
    description: 'Comment text',
    example: 'Please review the implementation and provide feedback',
  })
  @IsString()
  @MinLength(1, { message: 'Comment cannot be empty' })
  comment: string;

  @ApiProperty({
    description: 'Array of user IDs mentioned in the comment',
    example: ['user-id-1', 'user-id-2'],
    required: false,
  })
  @IsArray()
  @IsOptional()
  mentionedUserIds?: string[];
}

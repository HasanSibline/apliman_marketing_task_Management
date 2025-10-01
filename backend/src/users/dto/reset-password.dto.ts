import { IsString, IsEmail } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class ResetPasswordDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Invalid email address' })
  email: string

  @ApiProperty({
    description: 'New password',
    example: 'newPassword123',
  })
  @IsString()
  newPassword: string
}

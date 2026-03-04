import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
    @ApiProperty({ description: 'Email address of the account', example: 'user@company.com' })
    @IsEmail({}, { message: 'Please provide a valid email address' })
    email: string;
}

export class ResetPasswordDto {
    @ApiProperty({ description: 'Password reset token received via admin/email' })
    @IsString()
    token: string;

    @ApiProperty({ description: 'New password (minimum 8 characters)' })
    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    newPassword: string;
}

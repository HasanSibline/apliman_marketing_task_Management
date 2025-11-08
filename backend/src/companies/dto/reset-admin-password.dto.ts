import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetCompanyAdminPasswordDto {
  @ApiProperty({ example: 'admin@company.com', description: 'Company admin email' })
  @IsEmail()
  adminEmail: string;
}


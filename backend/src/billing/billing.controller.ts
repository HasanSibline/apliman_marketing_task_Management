import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';
import { BillingService } from './billing.service';
import { RecordPaymentDto } from './dto/record-payment.dto';

@ApiTags('Billing (Super Admin Only)')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Every company with its subscription state, renewal date, users against limit and last payment' })
  overview() {
    return this.billing.overview();
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Recorded payments, newest first, optionally for one company' })
  invoices(@Query('companyId') companyId?: string) {
    return this.billing.invoices(companyId || undefined);
  }

  @Post('companies/:id/payments')
  @ApiOperation({ summary: 'Record a payment received: creates an invoice record and extends the subscription' })
  recordPayment(@Param('id') id: string, @Body() dto: RecordPaymentDto, @Req() req) {
    return this.billing.recordPayment(id, dto, req.user.id);
  }

  @Post('companies/:id/apply-user-limit')
  @ApiOperation({ summary: 'Deactivate users above the plan limit (newest first, never company admins)' })
  applyUserLimit(@Param('id') id: string, @Req() req) {
    return this.billing.applyUserLimit(id, req.user.id);
  }
}

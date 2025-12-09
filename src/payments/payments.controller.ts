import { Controller, Post, Body } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  logger: any;
  constructor(private readonly paymentsService: PaymentsService) {}

  // 🟢 ایجاد پرداخت جدید (قابل انتخاب بودن شبکه)

  @Post('addfunds')
  async addFunds(
    @Body() body: { userId: string; amountUsd: number; network: string },
  ) {
    try {
      const result = await this.paymentsService.createTrxPayment(
        body.userId,
        body.amountUsd,
        body.network,
      );
      return { success: true, ...result }; // 👈 مهم: همیشه success برگردون
    } catch (error) {
      this.logger.error('❌ Payment creation failed', error);
      return {
        success: false,
        message: error.message || 'Server error',
      };
    }
  }

  // 🟢 مسیر callback برای IPN از NOWPayments
  @Post('ipn')
  async ipnCallback(@Body() body: any) {
    await this.paymentsService.handleIpn(body);
    // ✅ پاسخ برای تأیید دریافت
    return { status: 'ok' };
  }
}

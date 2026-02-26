import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  // 📥 ثبت زیرمجموعه جدید
  @Post('register')
  async registerReferral(
    @Body('referrerCode') referrerCode: string,
    @Body('newUserId') newUserId: string,
    @Body('position') position: 'left' | 'right',
  ) {
    return this.referralsService.registerReferral(referrerCode  , newUserId   );
  }


  @Post('activatevxcode')
  async activateVxCode(@Body() body: { userId: string }) {
    return this.referralsService.activateVxCode(body.userId);
  }


  // 🔍 جزئیات نود خاص
  @Post('node')
  async getReferralNodeDetails(@Body('userId') userId: string) {
    return this.referralsService.getReferralNodeDetails(userId);
  }

  // 🧾 تاریخچه تراکنش‌های ریفرال برای داشبورد
  @Post('transactions/my')
  async getReferralTransactions(@Body('userId') userId: string) {
    return this.referralsService.getReferralTransactions(userId);
  }
}

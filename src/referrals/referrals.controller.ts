import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
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
  ) {
    return this.referralsService.registerReferral(referrerCode, newUserId);
  }

   @Post('earnings')
  async getReferralEarnings(@Body() body: { userId: string }) {
    return this.referralsService.getReferralEarnings(body.userId);
  }

  // 📊 لیست زیرمجموعه‌ها
  @Post()
  async getUserReferrals(@Body('userId') userId: string) {
    return this.referralsService.getUserReferrals(userId);
  }

  // 📈 آمار کلی
  @Post('stats')
  async getReferralStats(@Body('userId') userId: string) {
    return this.referralsService.getReferralStats(userId);
  }

    // 📈 آمار کلی
  @Post('statscount')
  async getReferralStatsCount(@Body('userId') userId: string) {
    return this.referralsService.getReferralStatsCount(userId);
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

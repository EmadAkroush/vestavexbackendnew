import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('activity')
@UseGuards(JwtAuthGuard) // فقط کاربران لاگین‌شده
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  // 🔹 انتقال از profitBalance به mainBalance
  @Post('transferprofit')
  async transferProfitToMain(
    @Body() body: { userId: string; amount: number },
  ) {
    return this.activityService.transferProfitToMain(body.userId, body.amount);
  }

  // 🔹 انتقال از referralBalance به mainBalance
  @Post('transferreferral')
  async transferReferralToMain(
    @Body() body: { userId: string; amount: number },
  ) {
    return this.activityService.transferReferralToMain(body.userId, body.amount);
  }

  // 🔹 انتقال از bonusBalance به mainBalance
  @Post('transferbonus')
  async transferBonusToMain(
    @Body() body: { userId: string; amount: number },
  ) {
    return this.activityService.transferBonusToMain(body.userId, body.amount);
  }
}

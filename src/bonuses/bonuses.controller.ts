import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { BonusesService } from './bonuses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('bonuses')
@UseGuards(JwtAuthGuard)
export class BonusesController {
  constructor(private readonly bonusesService: BonusesService) {}

  // 📄 لیست پاداش‌های کاربر لاگین‌شده
  @Get('my')
  async getMyBonuses(@Req() req) {
    const userId = req.user.userId;
    return this.bonusesService.getUserBonuses(userId);
  }
}

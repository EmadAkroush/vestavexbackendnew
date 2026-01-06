import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InvestmentsService } from './investments.service';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('investments')
@UseGuards(JwtAuthGuard)
export class InvestmentsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  // 🟢 ایجاد یا ارتقای سرمایه‌گذاری
  @Post()
  async createOrUpgrade(@Req() req, @Body() dto: CreateInvestmentDto) {
    const { userId } = dto;
    return this.investmentsService.createInvestment({ ...dto, user: userId });
  }

  // 🟣 لیست سرمایه‌گذاری‌های کاربر لاگین‌شده
// 🟢 دریافت سرمایه‌گذاری‌های کاربر (نسخه کاربر)
  @Post('my')
  async getMyInvestments(@Body() body: { userId: string }) {
    return this.investmentsService.getUserInvestments(body.userId);
  }

  // 🟢 لیست سرمایه‌گذاری‌های هر کاربر (برای ادمین)
  @Post('user')
  async getUserInvestments(@Body() body: { userId: string }) {
    return this.investmentsService.getUserInvestments(body.userId);
  }

  // 🔴 لغو سرمایه‌گذاری و بازگشت وجه
  @Post('cancel')
  async cancel(@Body() body: { investmentId: string; }) {
    return this.investmentsService.cancelInvestment(body.investmentId);
  }

  // 🟠 اجرای دستی محاسبه سود روزانه
  @Post('calculate-profits')
  async calculateProfits() {
    return this.investmentsService.calculateMonthlyProfits();
  }


}

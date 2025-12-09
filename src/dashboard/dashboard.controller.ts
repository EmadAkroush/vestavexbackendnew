import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  // 📌 آمار کلی داشبورد  
  @Get('')
  async getDashboardStats() {
    return await this.dashboardService.getStats();
  }

  // 📌 نمودار ۱ — Investment Trend
  @Get('investmenttrend')
  async getInvestmentTrend() {
    return await this.dashboardService.getInvestmentTrend();
  }

  // 📌 نمودار ۲ — Deposits vs Withdrawals
  @Get('depositswithdrawals')
  async getDepositsVsWithdrawals() {
    return await this.dashboardService.getDepositsVsWithdrawals();
  }
}

import { Controller, Get, Param, Post, Body, UseGuards, Req } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // 🔹 لیست تراکنش‌های کاربر
  @UseGuards(JwtAuthGuard)
  @Get('my')
  async getMyTransactions(@Req() req) {
    const userId = req.user.sub;
    return this.transactionsService.getUserTransactions(userId);
  }

  // 🔹 جزئیات تراکنش خاص
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getTransaction(@Param('id') id: string) {
    return this.transactionsService.getTransactionById(id);
  }

  // 🔹 فقط برای تست — ایجاد تراکنش دستی
  @UseGuards(JwtAuthGuard)
  @Post('create')
  async createTx(@Req() req, @Body() body) {
    const userId = req.user.sub;
    return this.transactionsService.createTransaction({ userId, ...body });
  }
}

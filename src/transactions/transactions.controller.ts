import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // ✅ دریافت همه تراکنش‌ها برای سوپر ادمین
  @UseGuards(JwtAuthGuard)
  @Get('all')
  async getAllTransactions() {
    return this.transactionsService.getAllTransactionsForAdmin();
  }

  @UseGuards(JwtAuthGuard)
  @Post('updatestatusadmin')
  async updateStatusAdmin(@Body() body) {
    return this.transactionsService.updateTransactionStatusAdmin(
      body.id,
      body.status,
    );
  }

  // 🔹 دریافت لیست تراکنش‌های کاربر
  @UseGuards(JwtAuthGuard)
  @Post('my')
  async getUserTransactions(@Body() body: { userId: string }) {
    const userId = body.userId;
    if (!userId) throw new BadRequestException('User ID is required');

    return this.transactionsService.getUserTransactions(userId);
  }

  // 🔹 مشاهده جزئیات تراکنش خاص
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getTransaction(@Param('id') id: string) {
    const tx = await this.transactionsService.getTransactionById(id);
    if (!tx) throw new BadRequestException('Transaction not found');

    return tx;
  }

  // 🔹 ایجاد تراکنش جدید دستی توسط ادمین
  @UseGuards(JwtAuthGuard)
  @Post('create')
  async createTransaction(
    @Body()
    body: {
      userId: string;
      type: string;
      amount: number;
      currency?: string;
      note?: string;
    },
  ) {
    const userId = body.userId;
    if (!userId) throw new BadRequestException('User ID is required');

    return this.transactionsService.createTransaction({
      userId,
      type: body.type,
      amount: body.amount,
      currency: body.currency,
      status: 'completed',
      note: body.note || 'Manual transaction',
    });
  }

  // 🔹 درخواست برداشت (10٪ کارمزد)
  @UseGuards(JwtAuthGuard)
  @Post('withdraw')
  async requestWithdrawal(@Body() body: { userId: string; amount: number }) {
    const userId = body.userId;
    if (!userId) throw new BadRequestException('User ID is required');
    if (!body.amount || body.amount <= 0) {
      throw new BadRequestException('Invalid withdrawal amount');
    }

    return this.transactionsService.requestWithdrawal(userId, body.amount);
  }

  @UseGuards(JwtAuthGuard)
  @Post('chart/profit')
  async profitChart(@Body() body: { userId: string }) {
    return this.transactionsService.getProfitChart(body.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('chart/vx')
  async vxChart(@Body() body: { userId: string }) {
    return this.transactionsService.getVXChart(body.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('chart/deposit')
  async getDepositChart(@Body() body: { userId: string }) {
    return this.transactionsService.getDepositChart(body.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('chart/withdraw')
  async getWithdrawChart(@Body() body: { userId: string }) {
    return this.transactionsService.getWithdrawChart(body.userId);
  }
}

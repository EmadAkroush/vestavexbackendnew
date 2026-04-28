import { Controller, Post, Body, Logger, Get, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('web3/create')
  create(@Body() body) {
    return this.paymentsService.createWeb3Payment(body.userId, body.amountUsd);
  }

  @Post('web3/submit-tx')
  submitTx(@Body() body) {
    return this.paymentsService.submitTxHash(
      body.paymentId,
      body.txHash,
      body.fromAddress,
    );
  }

  // ================= NEW ROUTES =================

  // 📊 Deposit Chart
  @Get('chart/deposits/:range')
  getDepositChart(@Query('range') range: string) {
    return this.paymentsService.getDepositChart(range || 'Month');
  }

  // 📉 Withdraw Chart
  @Get('chart/withdraws/:range')
  getWithdrawChart(@Query('range') range: string) {
    return this.paymentsService.getWithdrawChart(range || 'Day');
  }
}
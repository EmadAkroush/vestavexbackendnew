import { Controller, Post, Body, Logger } from '@nestjs/common';
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
}

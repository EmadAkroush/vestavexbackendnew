import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ethers } from 'ethers';
import { InjectModel } from '@nestjs/mongoose';

import { UsersService } from '../users/users.service';
import { TransactionsService } from '../transactions/transactions.service';
import { Model } from 'mongoose';
import { Payment } from './payment.schema';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  // ---------------- Blockchain Config ----------------
  private readonly BNB_CHAIN_ID = 56;
  private readonly USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
  private readonly RECEIVER = '0x1234567890abcdef1234567890abcdef12345678';

  private readonly ERC20_ABI = [
    'function transfer(address to, uint amount)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address owner) view returns (uint)',
  ];

  private readonly provider = new ethers.providers.JsonRpcProvider(
    'https://bsc-dataseed.binance.org/',
  );

  constructor(
    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService,
   @InjectModel(Payment.name) private paymentModel: Model<Payment>,
  ) {}

  async createWeb3Payment(userId: string, amountUsd: number) {
    const paymentId = `WEB3_${Date.now()}_${userId}`;

    const payment = await this.paymentModel.create({
      userId,
      paymentId,
      amount: amountUsd,
      currency: 'USD',
      payCurrency: 'USDT',
      payAddress: this.RECEIVER,
      status: 'pending',
    });

    await this.transactionsService.createTransaction({
      userId,
      type: 'deposit',
      amount: amountUsd,
      currency: 'USD',
      status: 'pending',
      note: `Web3 payment created #${paymentId}`,
    });

    return {
      paymentId,
      receiver: this.RECEIVER,
      chainId: this.BNB_CHAIN_ID,
      tokenAddress: this.USDT_ADDRESS,
    };
  }

  // ---------------- ثبت txHash از فرانت ----------------
  async submitTxHash(paymentId: string, txHash: string, fromAddress: string) {
    const payment = await this.paymentModel.findOne({ paymentId });

    if (!payment) throw new Error('Payment not found');
    if (payment.txHash) throw new Error('Transaction already submitted');

    payment.txHash = txHash;
    payment.fromAddress = fromAddress;

    await payment.save();

    this.logger.log(`📥 TX submitted: ${txHash} for payment ${paymentId}`);

    return { success: true };
  }

  // ---------------- بررسی تراکنش روی بلاک‌چین ----------------
  private async verifyTransaction(payment: Payment): Promise<number | null> {
    const receipt = await this.provider.getTransactionReceipt(payment.txHash);

    if (!receipt || receipt.status !== 1) return null;

    const tx = await this.provider.getTransaction(payment.txHash);
    if (!tx || !tx.to) return null;

    // باید به قرارداد USDT خورده باشه
    if (tx.to.toLowerCase() !== this.USDT_ADDRESS.toLowerCase()) return null;

    const iface = new ethers.utils.Interface(this.ERC20_ABI);

    let decoded;
    try {
      decoded = iface.parseTransaction({ data: tx.data });
    } catch {
      return null;
    }

    if (decoded.name !== 'transfer') return null;

    const [to, amount] = decoded.args;

    if (to.toLowerCase() !== this.RECEIVER.toLowerCase()) return null;

    const decimals = 18; // USDT on BSC
    const amountUSDT = Number(ethers.utils.formatUnits(amount, decimals));

    return amountUSDT;
  }

  // ---------------- تایید نهایی پرداخت ----------------
  private async confirmPayment(payment: Payment, actualAmount: number) {
    payment.status = 'finished';
    payment.actualAmount = actualAmount;
    payment.confirmedAt = new Date();

    await this.usersService.addBalance(
      payment.userId,
      'mainBalance',
      actualAmount,
    );

    await this.transactionsService.createTransaction({
      userId: payment.userId,
      type: 'deposit',
      amount: actualAmount,
      currency: 'USD',
      status: 'finished',
      note: `Web3 payment confirmed #${payment._id}`,
    });

    await payment.save();

    this.logger.log(
      `✅ Payment confirmed | id=${payment._id} amount=${actualAmount}`,
    );
  }

  // ---------------- Cron Job بررسی پرداخت‌ها ----------------
  @Cron('*/30 * * * * *') // هر 30 ثانیه
  async checkPendingPayments() {
    const payments = await this.paymentModel.find({
      status: 'pending',
      txHash: { $exists: true },
    });

    for (const payment of payments) {
      try {
        const paidAmount = await this.verifyTransaction(payment);
        if (!paidAmount) continue;

        await this.confirmPayment(payment, paidAmount);
      } catch (err) {
        this.logger.warn(
          `⚠️ Verify failed | payment=${payment._id} ${err.message}`,
        );
      }
    }
  }
}

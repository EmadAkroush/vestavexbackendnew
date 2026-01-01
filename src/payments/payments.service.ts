import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Payment } from './payment.schema';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { TransactionsService } from '../transactions/transactions.service';
import { BonusesService } from '../bonuses/bonuses.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name)
    private paymentModel: Model<Payment>,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService,
    private readonly bonusesService: BonusesService,
  ) {}

  // 🟢 ایجاد پرداخت جدید با انتخاب شبکه (TRX, BTC, USDT, ...)
  async createTrxPayment(userId: string, amountUsd: number, network: string) {
    this.logger.log(
      `📤 [createTrxPayment] User: ${userId}, Amount: ${amountUsd}, Network: ${network}`,
    );

    try {
      const apiKey = this.config.get('NOWPAYMENTS_API_KEY');
      const appUrl = this.config.get('APP_URL');

      if (!apiKey)
        throw new Error(
          'Server configuration error: Missing NOWPAYMENTS_API_KEY',
        );
      if (!appUrl)
        throw new Error('Server configuration error: Missing APP_URL');

      const supportedNetworks = ['MATIC', 'USDTBSC', 'BNBBSC', 'USDTMATIC'];

      if (!supportedNetworks.includes(network)) {
        this.logger.warn(`⚠️ Unsupported network requested: ${network}`);
        throw new Error(`Unsupported payment network: ${network}`);
      }

      // 🟢 ارسال درخواست به NowPayments
      const response = await axios.post(
        'https://api.nowpayments.io/v1/payment',
        {
          price_amount: amountUsd,
          price_currency: 'USD',
          pay_currency: network,
          order_id: userId,
          ipn_callback_url: `${appUrl}/payments/ipn`,
        },
        {
          headers: { 'x-api-key': apiKey },
          timeout: 15000,
        },
      );

      if (!response.data?.payment_id || !response.data?.pay_address)
        throw new Error('Invalid response from NOWPayments API');

      // 🧾 ذخیره در دیتابیس
      const payment = await this.paymentModel.create({
        userId,
        paymentId: response.data.payment_id,
        status: response.data.payment_status,
        amount: amountUsd,
        currency: 'USD',
        payCurrency: network.toUpperCase(),
        payAddress: response.data.pay_address,
      });

      // ✅ تراکنش اولیه (در حال پرداخت)
      await this.transactionsService.createTransaction({
        userId,
        type: 'deposit',
        amount: amountUsd,
        currency: 'USD',
        status: 'pending',
        note: `Payment created (${network.toUpperCase()}) #${payment.paymentId}`,
      });

      return {
        success: true,
        message: 'Payment created successfully',
        paymentId: payment.paymentId,
        payAddress: response.data.pay_address,
        payCurrency: network.toUpperCase(),
      };
    } catch (error) {
      if (axios.isAxiosError(error))
        this.logger.error(
          `❌ [AxiosError] ${error.message}`,
          JSON.stringify(error.response?.data || {}, null, 2),
        );
      else
        this.logger.error(
          '❌ [Payment Creation Error]',
          error.stack || error.message,
        );

      throw new Error(error?.message || 'Payment creation failed');
    }
  }

  // ✅ IPN Handler (تأیید پرداخت و به‌روزرسانی)
  async handleIpn(data: any) {
    this.logger.log(`📩 [IPN Received] Data: ${JSON.stringify(data, null, 2)}`);

    try {
      const payment = await this.paymentModel.findOne({
        paymentId: data.payment_id,
      });

      if (!payment) {
        this.logger.warn(
          `⚠️ No matching payment found for IPN (id: ${data.payment_id})`,
        );
        return;
      }

      // 🧾 مبلغ واقعی پرداخت‌شده از NowPayments
      const actualAmount =
        data.actually_paid && Number(data.actually_paid) > 0
          ? Number(data.actually_paid)
          : payment.amount;

      // 🔁 بروزرسانی وضعیت پرداخت
      payment.status = data.payment_status;

      // 🧾 همیشه لاگ تراکنش IPN (صرف‌نظر از نوع وضعیت)
      await this.transactionsService.createTransaction({
        userId: payment.userId,
        type: 'deposit',
        amount: actualAmount,
        currency: 'USD',
        status: data.payment_status,
        note: `IPN update: ${data.payment_status} (${payment.payCurrency}) #${payment.paymentId}`,
      });

      // ✅ اگر پرداخت کامل یا جزئی بود
      if (
        data.payment_status === 'finished' ||
        data.payment_status === 'partially_paid'
      ) {
        this.logger.log(
          `✅ Payment confirmed (${data.payment_status}) for user: ${payment.userId}`,
        );

        payment.confirmedAt = new Date();
        payment.txHash = data.payin_hash;
        payment.amount = actualAmount; // 👈 ثبت مبلغ واقعی پرداخت‌شده

        // 👇 حتی در حالت partially_paid هم موجودی افزایش یابد
        await this.usersService.addBalance(
          payment.userId,
          'mainBalance',
          actualAmount,
        );

        // 🎁 بررسی پاداش لیدر
        // try {
        //   await this.bonusesService.checkAndAwardReferralBonus(
        //     payment.userId,
        //     actualAmount,
        //   );
        // } catch (bonusError) {
        //   this.logger.warn(
        //     `⚠️ Bonus check failed for user ${payment.userId}: ${bonusError.message}`,
        //   );
        // }
      }

      await payment.save();
      this.logger.log(
        `💾 Payment updated in DB: ${payment.paymentId} | Status: ${payment.status} | Amount: ${payment.amount}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [IPN Handler Error] ${error.stack || error.message}`,
      );
    }
  }
}

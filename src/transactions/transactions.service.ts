import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Transaction } from './schemas/transactions.schema';
import { User } from '../users/schemas/user.schema';
import mongoose from 'mongoose';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  // 🔥 دریافت لیست کامل تراکنش‌ها برای سوپر ادمین (بدون فیلتر + بدون پیجینیشن)
  async getAllTransactionsForAdmin() {
    return await this.transactionModel
      .find()
      .populate({ path: 'userId', select: 'email wallet' }) // فقط فیلدهای مهم یوزر
      .sort({ createdAt: -1 }) // مرتب‌سازی بر اساس جدیدترین تراکنش
      .lean();
  }

  // 🔹 ایجاد تراکنش جدید
  async createTransaction(data: {
    userId: string;
    type: string;
    amount: number;
    currency?: string;
    status?: string;
    paymentId?: string;
    statusUrl?: string;
    note?: string;
    txHash?: string;
  }) {
    const newTx = new this.transactionModel({
      ...data,
      currency: data.currency || 'USD',
      status: data.status || 'pending',
    });
    return await newTx.save();
  }

  // 🔹 دریافت سرمایه‌گذاری‌های کاربر
  async getUserInvestments(userId: string) {
    return await this.transactionModel
      .find({
        userId,
        type: 'investment',
      })
      .sort({ createdAt: -1 })
      .lean();
  }

  // 🔹 آپدیت وضعیت تراکنش بر اساس paymentId
  async updateTransactionStatus(
    paymentId: string,
    status: string,
    txHash?: string,
  ) {
    return await this.transactionModel.findOneAndUpdate(
      { paymentId },
      { status, txHash },
      { new: true },
    );
  }
  // 🔹 لیست تراکنش‌های کاربر (با لاگ برای دیباگ)
  async getUserTransactions(userId: string) {
    console.log(
      `[TransactionsService] getUserTransactions called with userId=${userId}`,
    );

    try {
      const objectId = new mongoose.Types.ObjectId(userId);

      const filter = {
        $or: [
          { userId: objectId }, // رکوردهای جدید
          { userId: userId }, // رکوردهای قدیمی که string هستند
          { userId: { $eq: objectId } }, // رکوردهایی که به صورت ObjectId هستند
          { userId: { $eq: userId } }, // رکوردهایی که به صورت string هستند
        ],
      };

      console.log('[TransactionsService] final filter:', filter);

      const txs = await this.transactionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .lean();

      console.log(`[TransactionsService] found ${txs.length} transactions`);
      return txs;
    } catch (error) {
      console.error('[TransactionsService] getUserTransactions error:', error);
      throw error;
    }
  }

  // 🔹 گرفتن جزئیات تراکنش خاص
  async getTransactionById(id: string) {
    return await this.transactionModel.findById(id);
  }

  // 🟥 برداشت از حساب (با 5٪ کارمزد)
  async requestWithdrawal(userId: string, amount: number) {
    if (amount <= 0) {
      throw new BadRequestException('Invalid withdrawal amount');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.mainBalance < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // 🚫 بررسی سقف مجاز برداشت (Max Cap)
    const newTotalWithdrawal = user.withdrawalTotalBalance + amount;

    if (newTotalWithdrawal > user.maxCapBalance) {
      throw new BadRequestException(
        'Withdrawal amount exceeds maximum allowed withdrawal capacity',
      );
    }

    // 💰 کم کردن مبلغ از موجودی اصلی
    user.mainBalance -= amount;

    // 📊 ثبت مجموع برداشت‌ها
    user.withdrawalTotalBalance = newTotalWithdrawal;

    await user.save();

    // 💸 محاسبه مبلغ خالص بعد از 5٪ کارمزد
    const netAmount = amount * 0.95;

    // 📘 ثبت تراکنش برداشت
    const tx = new this.transactionModel({
      userId,
      type: 'withdraw',
      amount,
      currency: 'USD',
      status: 'pending',
      note: `Withdrawal request submitted. User will receive ${netAmount.toFixed(
        2,
      )} USD after 5% fee.`,
    });

    return await tx.save();
  }

  async findByTypeAndDate(type: string, since: Date) {
    return await this.transactionModel.find({
      type,
      createdAt: { $gte: since },
    });
  }

  async updateTransactionStatusAdmin(id: string, status: string) {
    return await this.transactionModel.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    );
  }

  async getProfitChart(userId: string) {
    return this.transactionModel
      .aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            type: 'profit',
            status: 'completed',
          },
        },
        {
          $group: {
            _id: { $month: '$createdAt' },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            month: '$_id',
            total: 1,
          },
        },
      ])
      .then((rows) => ({
        labels: rows.map((r) => this.monthName(r.month)),
        data: rows.map((r) => r.total),
      }));
  }

  monthName(m: number) {
    return [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ][m - 1];
  }

  async getVXChart(userId: string) {
    return this.transactionModel
      .aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            type: { $in: ['referral', 'binary-profit'] },
            status: 'completed',
          },
        },
        {
          $group: {
            _id: { $month: '$createdAt' },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            month: '$_id',
            total: 1,
          },
        },
      ])
      .then((rows) => ({
        labels: rows.map((r) => this.monthName(r.month)),
        data: rows.map((r) => r.total),
      }));
  }
}

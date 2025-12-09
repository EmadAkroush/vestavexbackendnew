import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Investment } from '../investments/schemas/investments.schema';
import { Transaction } from '../transactions/schemas/transactions.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Investment.name) private investmentModel: Model<Investment>,
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
  ) {}

  /* =====================
          STATS
  ======================*/
async getStats() {
  const totalUsers = await this.userModel.countDocuments();

  const activeInvestments = await this.investmentModel.countDocuments({
    status: 'active',
  });

  // 🟩 مجموع مبلغ سرمایه‌گذاری‌های فعال
  const totalActiveInvestmentAmountResult = await this.investmentModel.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  const totalActiveInvestmentAmount =
    totalActiveInvestmentAmountResult[0]?.total || 0;

  const totalProfitResult = await this.transactionModel.aggregate([
    { $match: { type: 'profit' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return {
    users: totalUsers,
    activeInvestment: activeInvestments,
    totalActiveInvestmentAmount, // 🟩 این همون مجموع مقدار سرمایه‌گذاری‌های فعال است
    totalProfit: totalProfitResult[0]?.total || 0,
  };
}


  /* ============================
      CHART 1: Investment Trend
  =============================*/
  async getInvestmentTrend() {
    const result = await this.investmentModel.aggregate([
      {
        $group: {
          _id: { $month: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    const labels = result.map((r) => this.monthName(r._id));
    const data = result.map((r) => r.count);

    return { labels, data };
  }

  /* ============================
      CHART 2: Deposits vs Withdrawals
  =============================*/
  async getDepositsVsWithdrawals() {
    const result = await this.transactionModel.aggregate([
      {
        $match: {
          type: { $in: ['deposit', 'withdraw'] },
        },
      },
      {
        $group: {
          _id: { month: { $month: '$createdAt' }, type: '$type' },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]);

    // خروجی تمیز
    const labelsSet = new Set<number>();
    const deposits: number[] = [];
    const withdrawals: number[] = [];

    result.forEach((item) => {
      const month = item._id.month;
      labelsSet.add(month);
    });

    const labels = [...labelsSet].map((m) => this.monthName(m));

    labelsSet.forEach((month) => {
      const dep = result.find((x) => x._id.month === month && x._id.type === 'deposit');
      const wdr = result.find((x) => x._id.month === month && x._id.type === 'withdraw');

      deposits.push(dep?.total || 0);
      withdrawals.push(wdr?.total || 0);
    });

    return {
      labels,
      deposits,
      withdrawals,
    };
  }

  /* ======================
        Helper
  ======================*/
  private monthName(monthNumber: number) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return months[monthNumber - 1];
  }
}

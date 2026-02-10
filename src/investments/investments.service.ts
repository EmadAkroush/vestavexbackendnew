import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Investment } from './schemas/investments.schema';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { User } from '../users/schemas/user.schema';
import { Package } from '../packages/schemas/packages.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { ReferralProfitsService } from '../referralprofits/referralprofits.service';
@Injectable()
export class InvestmentsService {
  private readonly logger = new Logger(InvestmentsService.name);
  constructor(
    @InjectModel(Investment.name) private investmentModel: Model<Investment>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Package.name) private packageModel: Model<Package>,
    @InjectConnection() private readonly connection: Connection,
    private readonly transactionsService: TransactionsService,
    private readonly referralProfitsService: ReferralProfitsService,
  ) {}

  // 🟢 ایجاد یا ارتقا سرمایه‌گذاری
  async createInvestment(dto: CreateInvestmentDto) {
    try {
      const user = await this.userModel.findById(dto.user);
      if (!user) throw new NotFoundException('User not found');

      const packages = await this.packageModel.find().sort({ minDeposit: 1 });
      if (!packages || !packages.length) {
        throw new NotFoundException('No packages found');
      }

      let investment = await this.investmentModel.findOne({
        user: user._id,
        status: 'active',
      });

      const depositAmount = Number(dto.amount);
      if (!isFinite(depositAmount) || depositAmount <= 0) {
        throw new BadRequestException('Invalid investment amount');
      }

      if (user.mainBalance < depositAmount) {
        throw new BadRequestException('Insufficient balance');
      }

      const toNumeric = (val: any): number => {
        if (val == null) return NaN;
        if (typeof val === 'number') return val;
        let s = String(val).replace(/[^\d.\-]/g, '');
        const parts = s.split('.');
        if (parts.length > 2) s = parts.shift() + '.' + parts.join('');
        const n = Number(s);
        return isFinite(n) ? n : NaN;
      };

      const parseMin = (p: any) => {
        const n = toNumeric(p);
        return isFinite(n) ? n : 0;
      };
      const parseMax = (p: any) => {
        const n = toNumeric(p);
        return isFinite(n) ? n : Infinity;
      };

      user.mainBalance -= depositAmount;
      await user.save();

      await this.transactionsService.createTransaction({
        userId: user._id.toString(),
        type: investment ? 'investment-upgrade-init' : 'investment-init',
        amount: depositAmount,
        currency: 'USD',
        status: 'pending',
        note: 'Investment process started',
      });

      let shouldCalculateBinary = false; // ⭐️ فلگ کنترل سود باینری

      if (investment) {
        investment.amount = Number(investment.amount) + depositAmount;
        const totalAmount = Number(investment.amount);

        let newPackage = packages.find((p) => {
          const min = parseMin(p.minDeposit);
          const maxVal = parseMax(p.maxDeposit);
          return totalAmount >= min && totalAmount <= maxVal;
        });

        if (!newPackage) {
          const last = packages[packages.length - 1];
          if (last) {
            const lastMin = parseMin(last.minDeposit);
            if (totalAmount >= lastMin) {
              newPackage = last;
            }
          }
        }

        if (!newPackage) {
          throw new BadRequestException(
            'No matching package found for new total',
          );
        }

        investment.monthRate = newPackage.monthRate;

        if (investment.package.toString() !== newPackage._id.toString()) {
          investment.package = newPackage._id as any;
        }

        await investment.save();

        await this.transactionsService.createTransaction({
          userId: user._id.toString(),
          type: 'investment-upgrade',
          amount: depositAmount,
          currency: 'USD',
          status: 'completed',
          note: `Upgraded investment to ${newPackage.name}`,
        });

        shouldCalculateBinary = true; // ✅ افزایش سرمایه → سود محاسبه شود

        if (shouldCalculateBinary) {
          await this.referralProfitsService.calculateReferralProfits(
            user._id.toString(),
          );
        }

        return {
          success: true,
          message: `Investment updated successfully. Current package: ${newPackage.name}`,
          investment,
        };
      } else {
        const selectedPackage = packages.find((p) => {
          const min = parseMin(p.minDeposit);
          const maxVal = parseMax(p.maxDeposit);
          return depositAmount >= min && depositAmount <= maxVal;
        });

        if (!selectedPackage) {
          const last = packages[packages.length - 1];
          if (!(last && depositAmount >= parseMin(last.minDeposit))) {
            throw new BadRequestException(
              'No matching package for this amount',
            );
          }
        }

        const finalPackage = selectedPackage || packages[packages.length - 1];

        const finalMonthRate = finalPackage.monthRate;

        investment = new this.investmentModel({
          user: user._id,
          package: finalPackage._id,
          amount: depositAmount,
          monthRate: finalMonthRate,
          status: 'active',
        });

        const saved = await investment.save();

        await this.transactionsService.createTransaction({
          userId: user._id.toString(),
          type: 'investment',
          amount: depositAmount,
          currency: 'USD',
          status: 'completed',
          note: `Started investment in ${finalPackage.name}`,
        });

        shouldCalculateBinary = true; // ✅ خرید پکیج → سود محاسبه شود

        if (shouldCalculateBinary) {
          await this.referralProfitsService.calculateReferralProfits(
            user._id.toString(),
          );
        }

        return {
          success: true,
          message: `Investment started successfully in ${finalPackage.name} package.`,
          investment: saved,
        };
      }
    } catch (error) {
      if (dto?.user) {
        await this.transactionsService.createTransaction({
          userId: dto.user,
          type: 'investment-error',
          amount: Number(dto.amount) || 0,
          currency: 'USD',
          status: 'failed',
          note: `Investment failed: ${error.message || 'Unknown error'}`,
        });
      }

      throw new BadRequestException(
        error.message || 'Investment operation failed',
      );
    }
  }

  // 🟣 لیست سرمایه‌گذاری‌ها
  async getUserInvestments(userId: string) {
    return this.investmentModel
      .find({ user: new Types.ObjectId(userId) })
      .populate('package')
      .sort({ createdAt: -1 });
  }

  // 🟠 محاسبه سود روزانه (تابع عمومی برای CronJob)
  // 🟠 محاسبه سود روزانه (تابع عمومی برای CronJob)
async calculateMonthlyProfits() {
  const now = new Date();

  const investments = await this.investmentModel
    .find({ status: 'active' })
    .populate<{ user: User }>('user')
    .populate<{ package: Package }>('package');

  for (const inv of investments) {
    // 🔁 مبنای محاسبه: آخرین سود یا تاریخ شروع
    const baseDate = inv.lastProfitAt ?? inv.startDate;

    const daysPassed =
      (now.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24);

    // ❌ هنوز ۳۰ روز نشده
    if (daysPassed < 30) continue;

    // ✅ محاسبه سود ماهانه
    const profit = (inv.amount * inv.monthRate) / 100;

    // ✅ سود مرکب (اختیاری)
    inv.totalProfit += profit;
    // inv.amount += profit; // اگر خواستی مرکب باشه

    inv.lastProfitAt = now;
    await inv.save();

    // ➕ افزودن سود به کیف پول کاربر
    await this.userModel.findByIdAndUpdate(inv.user._id, {
      $inc: {
        profitBalance: profit,
      },
    });

    // 🧾 ثبت تراکنش
    await this.transactionsService.createTransaction({
      userId: inv.user._id.toString(),
      type: 'profit',
      amount: profit,
      currency: 'USD',
      status: 'completed',
      note: `Monthly profit (${inv.monthRate}% of ${inv.amount}) for ${inv.package.name}`,
    });

    this.logger.log(
      `💰 Monthly profit ${profit.toFixed(2)} USD added for ${inv.user.email} (${inv.package.name})`,
    );
  }

  this.logger.log('✅ Monthly profit calculation finished');
}


  // // 🕒 کرون جاب خودکار
  // @Cron(CronExpression.EVERY_DAY_AT_1AM)
  // async autoCalculateProfits() {
  //   this.logger.log('⏰ Starting daily profit cron job...');
  //   await this.calculateDailyProfits();
  // }

  // 🕒 کرون جاب خودکار
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async autoCalculateProfits() {
    this.logger.log('⏰ Starting daily profit cron job...');

    // ✅ روزهای غیر تعطیل → محاسبه سود
    await this.calculateMonthlyProfits();
  }

  // 🔴 لغو سرمایه‌گذاری
  async cancelInvestment(id: string) {
    const inv = await this.investmentModel.findById(id);
    if (!inv) throw new NotFoundException('Investment not found');
    if (inv.status !== 'active')
      throw new BadRequestException('Investment already closed');

    inv.status = 'canceled';
    await inv.save();

    await this.userModel.findByIdAndUpdate(inv.user, {
      $inc: { mainBalance: inv.amount },
    });

    await this.transactionsService.createTransaction({
      userId: inv.user.toString(),
      type: 'refund',
      amount: inv.amount,
      status: 'completed',
      note: `Investment canceled and refunded`,
    });

    return { message: 'Investment canceled and funds returned' };
  }
}

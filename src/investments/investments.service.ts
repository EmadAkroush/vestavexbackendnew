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

@Injectable()
export class InvestmentsService {
  private readonly logger = new Logger(InvestmentsService.name);

  constructor(
    @InjectModel(Investment.name) private investmentModel: Model<Investment>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Package.name) private packageModel: Model<Package>,
    @InjectConnection() private readonly connection: Connection, // ✅ اضافه شد
    private readonly transactionsService: TransactionsService,
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

      // ❗ نرخ ماهانه ثابت، بدون بونس
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

      return {
        success: true,
        message: `Investment updated successfully. Current package: ${newPackage.name}`,
        investment,
      };
    } 
    
    else {
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

      // ❗ نرخ ماهانه ثابت، بدون بونس
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
  async calculateDailyProfits() {
    // 👇 populate برای دسترسی به اطلاعات کاربر و پکیج
    const investments = await this.investmentModel
      .find({ status: 'active' })
      .populate<{ user: User }>('user')
      .populate<{ package: Package }>('package');

    for (const inv of investments) {
      const profit = (inv.amount * inv.monthRate) / 100;

      // ✅ افزودن سود به سرمایه‌گذاری (سود مرکب)
      inv.totalProfit += profit;
      inv.amount += profit; // 👈 این خط جدید اضافه شد (سود به اصل سرمایه افزوده می‌شود)
      await inv.save();

      // ✅ افزودن سود به حساب کاربر
      await this.userModel.findByIdAndUpdate(inv.user._id, {
        $inc: { profitBalance: profit },
      });

      // ✅ ثبت تراکنش سود روزانه
      await this.transactionsService.createTransaction({
        userId: inv.user._id.toString(),
        type: 'profit',
        amount: profit,
        currency: 'USD',
        status: 'completed',
        note: `Daily profit (${inv.monthRate}% of ${inv.amount - profit}) for ${inv.package.name}`,
      });

      this.logger.log(
        `💰 Profit ${profit.toFixed(2)} USD added for ${inv.user.email} (${inv.package.name}) — new amount: ${inv.amount.toFixed(2)}`,
      );
    }

    this.logger.log('✅ Daily profits calculated successfully (compound mode)');
    return {
      message:
        'Daily profits calculated and logged successfully (compound mode)',
    };
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

    // ❌ اگر امروز شنبه یا یکشنبه بود، سود محاسبه نشود
    const today = new Date().getDay(); // 0 = Sunday, 6 = Saturday

    if (today === 0 || today === 6) {
      this.logger.log(
        '🚫 Weekend detected — no profit calculated on Saturday/Sunday.',
      );
      return;
    }

    // ✅ روزهای غیر تعطیل → محاسبه سود
    await this.calculateDailyProfits();
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

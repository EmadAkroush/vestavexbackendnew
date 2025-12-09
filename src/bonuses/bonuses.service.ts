import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Bonus } from './schemas/bonuses.schema';
import { UsersService } from '../users/users.service';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class BonusesService {
  private readonly logger = new Logger(BonusesService.name);

  constructor(
    @InjectModel(Bonus.name) private bonusModel: Model<Bonus>,
    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService,
  ) {}

  /**
   * 🎁 بررسی و ثبت پاداش لیدر در صورت واریز اولین سپرده بالای 100$
   */
  async checkAndAwardReferralBonus(userId: string, depositAmount: number) {
    if (depositAmount < 100) return; // شرط حداقل سپرده

    const user = await this.usersService.findById(userId);
    if (!user || !user.referredBy) return;

    const leader = await this.usersService.findByVxCode(user.referredBy);
    if (!leader) return;

    // بررسی اینکه قبلاً بابت این زیرمجموعه پاداشی ثبت نشده
    const existingBonus = await this.bonusModel.findOne({
      user: leader._id,
      referredUser: user._id,
      type: 'deposit_bonus',
    });

    if (existingBonus) {
      this.logger.log(`⚠️ Bonus already awarded for ${user.email}`);
      return;
    }

    // ایجاد رکورد پاداش جدید
    const bonus = await this.bonusModel.create({
      user: leader._id,
      referredUser: user._id,
      amount: 8,
      type: 'deposit_bonus',
    });

    // اضافه کردن پاداش به حساب بونوس لیدر
    await this.usersService.addBalance(leader._id.toString(), 'bonusBalance', 8);

    // ثبت تراکنش
    await this.transactionsService.createTransaction({
      userId: leader._id.toString(),
      type: 'bonus',
      amount: 8,
      currency: 'USD',
      status: 'completed',
      note: `Referral bonus for ${user.email}'s first deposit`,
    });

    this.logger.log(
      `🎉 $8 bonus awarded to ${leader.email} for referral ${user.email}`,
    );

    return bonus;
  }

  // 📄 دریافت لیست پاداش‌های کاربر
  async getUserBonuses(userId: string) {
    return this.bonusModel
      .find({ user: new Types.ObjectId(userId) })
      .populate('referredUser', 'firstName lastName email')
      .sort({ createdAt: -1 });
  }
}

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Referral } from './schemas/referrals.schema';
import { UsersService } from '../users/users.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as mongoose from 'mongoose';
import { TransactionsService } from '../transactions/transactions.service'; // ✅ اضافه شد
import { User } from '../users/schemas/user.schema';
import { InvestmentsService } from 'src/investments/investments.service';

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    @InjectModel(Referral.name) private referralModel: Model<Referral>,
    @InjectModel(User.name) private readonly userModel: Model<User>, // ✅ اضافه کن
    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService, // ✅ اضافه شد
    private readonly investmentsService: InvestmentsService,
  ) {}

  // 📥 ثبت زیرمجموعه جدید (در ثبت‌نام یا پروفایل)
  async registerReferral(referrerCode: string, newUserId: string) {
    const newUser = await this.usersService.findById(newUserId);
    if (!newUser) throw new NotFoundException('User not found');

    if (newUser.referredBy) {
      return { success: false, message: 'You already have a referrer.' };
    }

    const referrer = await this.usersService.findByVxCode(referrerCode);
    if (!referrer) return { success: false, message: 'Invalid referral code.' };

    newUser.referredBy = referrer.vxCode;
    await newUser.save();

    await this.referralModel.create({
      referrer: referrer._id,
      referredUser: newUser._id,
    });

    referrer.referrals.push(
      new mongoose.Types.ObjectId(newUser._id.toString()),
    );
    await referrer.save();

    return {
      success: true,
      message: `Referral connected to ${referrer.firstName} ${referrer.lastName}`,
      referrer: {
        id: referrer._id,
        name: `${referrer.firstName} ${referrer.lastName}`,
        vxCode: referrer.vxCode,
      },
    };
  }

  // 📊 لیست زیرمجموعه‌ها
  async getUserReferrals(userId: string) {
    const rootUser = await this.usersService.findById(userId);
    if (!rootUser) throw new NotFoundException('User not found');

    const buildTree = async (parentId: string): Promise<any> => {
      const children = await this.referralModel
        .find({ parent: new Types.ObjectId(parentId) })
        .populate(
          'referredUser',
          'firstName lastName email vxCode mainBalance profitBalance',
        )
        .lean();

      const left = children.find((c) => c.position === 'left');
      const right = children.find((c) => c.position === 'right');

      return {
        user: await this.usersService.findById(parentId),
        left: left ? await buildTree(left.referredUser._id.toString()) : null,
        right: right
          ? await buildTree(right.referredUser._id.toString())
          : null,
      };
    };

    return buildTree(userId);
  }

  // 💰 افزودن سود ریفرال
  async addReferralProfit(
    referrerId: string,
    amount: number,
    fromUserId: string,
  ) {
    let currentUserId = fromUserId;
    let level = 1;

    while (true) {
      const referral = await this.referralModel.findOne({
        user: currentUserId,
      });

      if (!referral) break; // رسیدیم به ریشه درخت

      const parentId = referral.parent.toString();

      // 🔍 گرفتن کاربر والد
      const parent = await this.usersService.findById(parentId);
      if (!parent) break;

      // 💾 ثبت سود در جدول referral
      await this.referralModel.findOneAndUpdate(
        { parent: parentId, user: currentUserId },
        { $inc: { profitEarned: amount } },
        { upsert: true },
      );

      // 💰 افزودن سود به کیف پول ریفرال
      await this.usersService.addBalance(parentId, 'referralBalance', amount);

      // 🔒 افزودن همان سود به maxCapBalance (برای قانون 3x برداشت)
      await this.usersService.addBalance(parentId, 'maxCapBalance', amount);

      // ⬆️ حرکت به uplink
      currentUserId = parentId;
      level++;
    }
  }

  // 📈 آمار کلی زیرمجموعه‌ها
  async getReferralStats(
  fromUserId: string,
  investmentAmount: number,
) {
  this.logger.log(
    `🚀 Binary profit calculation started from user ${fromUserId} with amount ${investmentAmount}`,
  );

  let currentUserId = fromUserId;
  let level = 1;

  while (true) {
    const referral = await this.referralModel.findOne({
      user: currentUserId,
    });

    if (!referral) {
      this.logger.log('🟢 Reached root of binary tree');
      break;
    }

    const parentId = referral.parent.toString();
    const position = referral.position; // left | right

    const parent = await this.usersService.findById(parentId);
    if (!parent) break;

    // 📊 افزایش حجم سمت مربوطه
    if (position === 'left') {
      parent.leftVolume = (parent.leftVolume || 0) + investmentAmount;
    } else {
      parent.rightVolume = (parent.rightVolume || 0) + investmentAmount;
    }

    await parent.save();

    const left = parent.leftVolume || 0;
    const right = parent.rightVolume || 0;

    const balancedVolume = Math.min(left, right);
    const payableUnits = Math.floor(balancedVolume / 200);

    if (payableUnits <= 0) {
      await this.transactionsService.createTransaction({
        userId: parentId,
        type: 'binary-profit',
        amount: 0,
        currency: 'USD',
        status: 'rejected',
        note: `Level ${level} | Not balanced | L=${left} R=${right}`,
      });

      this.logger.warn(
        `⛔ Level ${level} | Parent ${parent.email} NOT balanced (L=${left}, R=${right})`,
      );

      currentUserId = parentId;
      level++;
      continue;
    }

    const profit = payableUnits * 35;

    // 🧮 کسر حجم مصرف‌شده
    parent.leftVolume -= payableUnits * 200;
    parent.rightVolume -= payableUnits * 200;

    await parent.save();

    // 💰 افزودن سود
    await this.usersService.addBalance(parentId, 'referralBalance', profit);
    await this.usersService.addBalance(parentId, 'maxCapBalance', profit);

    // 🧾 ثبت تراکنش
    await this.transactionsService.createTransaction({
      userId: parentId,
      type: 'binary-profit',
      amount: profit,
      currency: 'USD',
      status: 'completed',
      note: `Level ${level} | Binary matched ${payableUnits * 200}$ | From user ${fromUserId}`,
    });

    this.logger.log(
      `💰 Level ${level} | ${profit}$ binary profit paid to ${parent.email}`,
    );

    currentUserId = parentId;
    level++;
  }

  this.logger.log('✅ Binary profit calculation completed');
}


  async getReferralStatsCount(userId: string) {
    this.logger.log(`🚀 Calculating referral stats for userId: ${userId}`);

    // 🧩 پیدا کردن کاربر اصلی
    const rootUser = await this.userModel.findById(userId).lean();
    if (!rootUser) {
      this.logger.error(`❌ User not found for ID: ${userId}`);
      throw new Error('User not found');
    }

    const rootVxCode = rootUser.vxCode;
    this.logger.debug(`🎯 Root vxCode: ${rootVxCode}`);

    // 🟠 سطح 1: تمام کسانی که referredBy = vxCode کاربر اصلی دارند
    const level1 = await this.userModel
      .find({ referredBy: rootVxCode })
      .select('_id vxCode email firstName lastName')
      .lean();
    this.logger.debug(`🧩 Level 1 referrals found: ${level1.length}`);

    // 🟡 سطح 2: کسانی که referredBy = vxCode یکی از level1 هستند
    const level1Codes = level1.map((u) => u.vxCode).filter(Boolean);
    const level2 = level1Codes.length
      ? await this.userModel
          .find({ referredBy: { $in: level1Codes } })
          .select('_id vxCode email firstName lastName')
          .lean()
      : [];
    this.logger.debug(`🧩 Level 2 referrals found: ${level2.length}`);

    // 🟢 سطح 3: کسانی که referredBy = vxCode یکی از level2 هستند
    const level2Codes = level2.map((u) => u.vxCode).filter(Boolean);
    const level3 = level2Codes.length
      ? await this.userModel
          .find({ referredBy: { $in: level2Codes } })
          .select('_id vxCode email firstName lastName')
          .lean()
      : [];
    this.logger.debug(`🧩 Level 3 referrals found: ${level3.length}`);

    // 📊 محاسبه درصد پیشرفت فرضی (مثلاً هر سطح کامل = 33%)
    const totalLevels = 3;
    const filledLevels = [level1.length, level2.length, level3.length].filter(
      (l) => l > 0,
    ).length;
    const progress = Math.round((filledLevels / totalLevels) * 100);

    this.logger.log(
      `✅ Referral stats calculated: L1=${level1.length}, L2=${level2.length}, L3=${level3.length}`,
    );

    return {
      level1Count: level1.length,
      level2Count: level2.length,
      level3Count: level3.length,
      progress,
    };
  }

  // 🟢 محاسبه مجموع سرمایه‌گذاری‌ها در هر سطح (فقط پکیج‌هایی با status = 'active')
  async getReferralEarnings(userId: string) {
    this.logger.log(
      `🚀 Calculating referral investments for userId: ${userId}`,
    );

    // 🧩 1. پیدا کردن کاربر اصلی
    const rootUser = await this.userModel.findById(userId).lean();
    if (!rootUser) {
      this.logger.error(`❌ User not found for ID: ${userId}`);
      throw new Error('User not found');
    }

    const rootVxCode = rootUser.vxCode;
    this.logger.debug(`🎯 Root vxCode: ${rootVxCode}`);

    // 🟠 سطح 1: کاربران مستقیم
    const level1Users = await this.userModel
      .find({ referredBy: rootVxCode })
      .select('_id vxCode')
      .lean();
    this.logger.debug(`📊 Level 1 referrals: ${level1Users.length}`);

    // 🟡 سطح 2
    const level1Codes = level1Users.map((u) => u.vxCode);
    const level2Users = level1Codes.length
      ? await this.userModel
          .find({ referredBy: { $in: level1Codes } })
          .select('_id vxCode')
          .lean()
      : [];
    this.logger.debug(`📊 Level 2 referrals: ${level2Users.length}`);

    // 🟢 سطح 3
    const level2Codes = level2Users.map((u) => u.vxCode);
    const level3Users = level2Codes.length
      ? await this.userModel
          .find({ referredBy: { $in: level2Codes } })
          .select('_id vxCode')
          .lean()
      : [];
    this.logger.debug(`📊 Level 3 referrals: ${level3Users.length}`);

    // 💰 محاسبه مجموع سرمایه‌گذاری هر سطح — فقط پکیج‌های active
    const calculateInvestments = async (users: any[]) => {
      const investments = await Promise.all(
        users.map(async (user) => {
          const userInvestments =
            await this.investmentsService.getUserInvestments(user._id);
          const activeInvestments = (userInvestments || []).filter(
            (inv: any) => inv && inv.status === 'active',
          );
          return activeInvestments.reduce(
            (sum: number, inv: any) => sum + (Number(inv.amount) || 0),
            0,
          );
        }),
      );
      return investments.reduce((total, investment) => total + investment, 0);
    };

    const level1Investment = await calculateInvestments(level1Users);
    const level2Investment = await calculateInvestments(level2Users);
    const level3Investment = await calculateInvestments(level3Users);

    this.logger.log(
      `✅ Referral investments (active only): L1=${level1Investment}, L2=${level2Investment}, L3=${level3Investment}`,
    );

    return {
      level1Investment,
      level2Investment,
      level3Investment,
    };
  }

  // 🔍 جزئیات نود (برای نمایش در درخت ریفرال)
  async getReferralNodeDetails(userId: string, depth = 3) {
    // تابع بازگشتی برای ساخت درخت
    const buildTree = async (referrerId: string, level = 1): Promise<any[]> => {
      if (level > depth) return [];

      const referrals = await this.referralModel
        .find({ referrer: new Types.ObjectId(referrerId) })
        .populate(
          'referredUser',
          'firstName lastName email vxCode mainBalance profitBalance',
        )
        .exec();

      return Promise.all(
        referrals.map(async (r) => {
          const referred = r.referredUser as any;
          if (!referred) return null;

          const children = await buildTree(referred._id.toString(), level + 1);

          return {
            id: referred._id.toString(),
            name: `${referred.firstName} ${referred.lastName}`,
            email: referred.email,
            vxCode: referred.vxCode,
            balances: {
              main: referred.mainBalance,
              profit: referred.profitBalance,
            },
            profitEarned: r.profitEarned,
            joinedAt: r.joinedAt,
            children, // 👈 اضافه شد برای نمایش سطح‌های پایین‌تر
          };
        }),
      ).then((res) => res.filter(Boolean));
    };

    return await buildTree(userId);
  }



  async calculateReferralProfits(
  fromUserId: string,
  investmentAmount: number,
) {
  this.logger.log(
    `🔁 Binary profit calculation started from user=${fromUserId} amount=${investmentAmount}`,
  );

  let currentUserId = fromUserId;
  let level = 1;

  while (true) {
    const referral = await this.referralModel.findOne({
      user: currentUserId,
    });

    if (!referral) {
      this.logger.log(`🛑 Reached root at level ${level}`);
      break;
    }

    const parentId = referral.parent.toString();
    const position = referral.position;

    this.logger.log(
      `⬆️ Level ${level} | child=${currentUserId} → parent=${parentId} | position=${position}`,
    );

    /**
     * 🔍 جمع سرمایه‌گذاری‌های هر دست
     */
    const leftUsers = await this.referralModel.find({
      parent: parentId,
      position: 'left',
    });

    const rightUsers = await this.referralModel.find({
      parent: parentId,
      position: 'right',
    });

    const leftTotal = await this.calculateTotalInvestment(leftUsers);
    const rightTotal = await this.calculateTotalInvestment(rightUsers);

    this.logger.log(
      `📊 Level ${level} | Parent=${parentId} | Left=${leftTotal} | Right=${rightTotal}`,
    );

    const pairable = Math.min(leftTotal, rightTotal);
    const pairs = Math.floor(pairable / 200);
    const reward = pairs * 35;

    if (reward > 0) {
      this.logger.log(
        `💰 Level ${level} | Parent=${parentId} earned=${reward}`,
      );

      // 💰 افزودن سود
      await this.usersService.addBalance(
        parentId,
        'referralBalance',
        reward,
      );

      await this.usersService.addBalance(
        parentId,
        'maxCapBalance',
        reward,
      );

      // 💾 ثبت در referral
      await this.referralModel.findOneAndUpdate(
        { parent: parentId, user: currentUserId },
        { $inc: { profitEarned: reward } },
        { upsert: true },
      );

      // 🧾 ثبت تراکنش
      await this.transactionsService.createTransaction({
        userId: parentId,
        type: 'binary-profit',
        amount: reward,
        currency: 'USD',
        status: 'completed',
        note: `Binary profit | Level ${level} | Pairs=${pairs} | Left=${leftTotal} | Right=${rightTotal}`,
      });
    } else {
      // ❌ عدم دریافت سود
      this.logger.warn(
        `⚠️ Level ${level} | Parent=${parentId} NO PROFIT | Left=${leftTotal} | Right=${rightTotal}`,
      );

      await this.transactionsService.createTransaction({
        userId: parentId,
        type: 'binary-profit-skip',
        amount: 0,
        currency: 'USD',
        status: 'skipped',
        note: `Binary not balanced | Level ${level} | Left=${leftTotal} | Right=${rightTotal}`,
      });
    }

    currentUserId = parentId;
    level++;
  }

  this.logger.log('✅ Binary profit calculation completed');
}

async calculateTotalInvestment(referrals: any[]) {
  let total = 0;

  for (const ref of referrals) {
    const user = await this.usersService.findById(ref.user.toString());
    if (!user) continue;

    total += user.mainBalance || 0;
  }

  return total;
}



  // 🧾 گرفتن تراکنش‌های ریفرال کاربر برای داشبورد
  async getReferralTransactions(userId: string) {
    const transactions =
      await this.transactionsService.getUserTransactions(userId);
    return transactions.filter((tx) => tx.type === 'referral-profit');
  }
}

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
  // 📥 ثبت زیرمجموعه جدید در باینری پلن
  async registerReferral(
    referrerCode: string,
    newUserId: string,
    position: 'left' | 'right',
  ) {
    // 🔍 کاربر جدید
    const newUser = await this.usersService.findById(newUserId);
    if (!newUser) {
      throw new NotFoundException('User not found');
    }

    // 🔒 هر کاربر فقط یک uplink
    const alreadyLinked = await this.referralModel.findOne({
      referredUser: newUser._id,
    });

    if (alreadyLinked) {
      return {
        success: false,
        message: 'You are already connected in the binary tree.',
      };
    }

    // 🔍 لیدر با VX Code
    const parent = await this.usersService.findByVxCode(referrerCode);
    if (!parent) {
      return {
        success: false,
        message: 'Invalid referral code.',
      };
    }

    // ❌ جلوگیری از self-referral
    // compare string representations to avoid using unknown typed ObjectId.equals
    if (String(parent._id) === String(newUser._id)) {
      return {
        success: false,
        message: 'You cannot refer yourself.',
      };
    }

    // 🔒 جلوگیری از پر بودن سمت
    const positionTaken = await this.referralModel.findOne({
      parent: parent._id,
      position,
    });

    if (positionTaken) {
      return {
        success: false,
        message: `The ${position} position is already occupied.`,
      };
    }

    // 🧬 ثبت اتصال باینری
    await this.referralModel.create({
      parent: parent._id,
      referredUser: newUser._id,
      position,
    });

    return {
      success: true,
      message: `Successfully placed on ${position} side of ${parent.firstName}.`,
      data: {
        parentId: parent._id,
        position,
      },
    };
  }

  async activateVxCode(userId: string) {
    const VX_CODE_PRICE = 5;

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ❌ اگر قبلاً فعال شده
    if (user.activeVxCode) {
      return {
        success: false,
        message: 'VX Code has already been activated.',
      };
    }

    // ❌ اگر موجودی کافی نیست
    if ((user.mainBalance || 0) < VX_CODE_PRICE) {
      return {
        success: false,
        message: 'Insufficient balance. Minimum $5 required.',
        required: VX_CODE_PRICE,
        currentBalance: user.mainBalance || 0,
      };
    }

    // ✅ کسر مبلغ
    user.mainBalance -= VX_CODE_PRICE;

    // ✅ فعال‌سازی VX Code
    user.activeVxCode = true;

    await user.save();

    await this.transactionsService.createTransaction({
      userId: user._id.toString(),
      type: 'vx-code-activation',
      amount: VX_CODE_PRICE,
      currency: 'USD',
      status: 'completed',
      note: 'VX Code activation fee',
    });

    return {
      success: true,
      message: 'VX Code activated successfully.',
      balance: {
        mainBalance: user.mainBalance,
      },
      activeVxCode: true,
    };
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
  async getReferralDashboardStats(userId: string) {
    this.logger.log(`📊 Fetching referral dashboard stats for ${userId}`);

    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException('User not found');

    /* ============================
     👥 TOTAL MEMBERS
  ============================ */
    const totalMembers = await this.referralModel.countDocuments({
      parent: new Types.ObjectId(userId),
    });

    /* ============================
     📦 LEFT / RIGHT VOLUME
  ============================ */
    const { leftVolume, rightVolume } = await this.getReferralEarnings(userId);

    const totalTeamVolume = leftVolume + rightVolume;

    /* ============================
     💼 USER INVESTMENTS
  ============================ */
    const investments =
      await this.investmentsService.getUserInvestments(userId);

    const totalActiveInvestment = (investments || [])
      .filter((i) => i.status === 'active')
      .reduce((sum, i) => sum + Number(i.amount || 0), 0);

    /* ============================
     ⚖️ ACCOUNT CAPACITY (3x)
  ============================ */
    const accountCapacity = totalActiveInvestment * 3;

    /* ============================
     🔁 USED / FLUSH
  ============================ */
    const usedCapacity = Math.min(leftVolume, rightVolume);

    const flushOut =
      leftVolume !== rightVolume ? Math.abs(leftVolume - rightVolume) : 0;

    /* ============================
     🔄 CYCLES
  ============================ */
    const vxc = Math.floor(usedCapacity / 200);

    /* ============================
     💸 WITHDRAWALS (READ ONLY)
  ============================ */
    const withdrawalTotalBalance = user.withdrawalTotalBalance || 0;

    return {
      totalMembers,
      totalTeamVolume,
      leftVolume,
      rightVolume,
      accountCapacity,
      usedCapacity,
      flushOut,
      vxc,

      totalActiveInvestment,
      withdrawalTotalBalance,
    };
  }



  // 🟢 محاسبه مجموع سرمایه‌گذاری‌ها در هر سطح
  async getReferralEarnings(userId: string) {
    this.logger.warn(`🚀 START getReferralEarnings | root=${userId}`);

    const calculateSubtreeVolume = async (
      parentId: string,
      level = 1,
    ): Promise<number> => {
      this.logger.warn(
        `\n🔁 [LEVEL ${level}] calculateSubtreeVolume(parent=${parentId})`,
      );

      let total = 0;

      const referrals = await this.referralModel
        .find({ parent: new Types.ObjectId(parentId) })
        .select('referredUser')
        .lean();

      this.logger.warn(
        `👶 [LEVEL ${level}] referrals found = ${referrals.length}`,
      );

      for (const r of referrals) {
        const childId = r.referredUser.toString();

        this.logger.warn(`➡️ [LEVEL ${level}] visiting child=${childId}`);

        const investments =
          await this.investmentsService.getUserInvestments(childId);

        const activeSum = (investments || [])
          .filter((i) => i.status === 'active')
          .reduce((sum, i) => sum + Number(i.amount || 0), 0);

        this.logger.warn(
          `💰 [LEVEL ${level}] child=${childId} activeSum=${activeSum}`,
        );

        total += activeSum;

        total += await calculateSubtreeVolume(childId, level + 1);
      }

      this.logger.warn(`✅ [LEVEL ${level}] subtotal=${total}`);

      return total;
    };

    // 🔹 لول اول
    const leftChild = await this.referralModel.findOne({
      parent: new Types.ObjectId(userId),
      position: 'left',
    });

    const rightChild = await this.referralModel.findOne({
      parent: new Types.ObjectId(userId),
      position: 'right',
    });

    this.logger.warn(
      `🌿 root children → left=${leftChild?.referredUser} | right=${rightChild?.referredUser}`,
    );

    const leftVolume = leftChild
      ? await calculateSubtreeVolume(leftChild.referredUser.toString())
      : 0;

    const rightVolume = rightChild
      ? await calculateSubtreeVolume(rightChild.referredUser.toString())
      : 0;

    this.logger.warn(
      `📊 FINAL volumes → LEFT=${leftVolume}, RIGHT=${rightVolume}`,
    );

    return {
      leftVolume,
      rightVolume,
      weakerSide: Math.min(leftVolume, rightVolume),
      strongerSide: Math.max(leftVolume, rightVolume),
    };
  }

  // 🌳 جزئیات نود برای نمایش درخت باینری
  // 🌳 جزئیات نود برای نمایش درخت باینری
async getReferralNodeDetails(userId: string, depth = Infinity) {
  this.logger.warn(
    `🌳 [START] Building binary referral tree for user=${userId}, depth=${depth}`,
  );

  /* =========================
     🔢 CALCULATE SUBTREE VOLUME
  ========================= */
  const calculateSubtreeVolume = async (userId: string): Promise<number> => {
    let total = 0;

    const investments =
      await this.investmentsService.getUserInvestments(userId);

    const activeSum = (investments || [])
      .filter((i: any) => i.status === 'active')
      .reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);

    total += activeSum;

    const referrals = await this.referralModel
      .find({ parent: new Types.ObjectId(userId) })
      .select('referredUser')
      .lean();

    for (const r of referrals) {
      total += await calculateSubtreeVolume(r.referredUser.toString());
    }

    return total;
  };

  /* =========================
     🔢 CALCULATE SUBTREE COUNT
  ========================= */
  const calculateSubtreeCount = async (userId: string): Promise<number> => {
    let count = 0;

    const referrals = await this.referralModel
      .find({ parent: new Types.ObjectId(userId) })
      .select('referredUser')
      .lean();

    for (const r of referrals) {
      count += 1;
      count += await calculateSubtreeCount(r.referredUser.toString());
    }

    return count;
  };

  /* =========================
     🌳 BUILD TREE
  ========================= */
  const buildTree = async (
    parentId: string,
    level = 1,
  ): Promise<any | null> => {
    this.logger.warn(
      `\n🔁 [LEVEL ${level}] buildTree called with parentId=${parentId}`,
    );

    if (level > depth) return null;

    const user = await this.userModel
      .findById(parentId)
      .select(
        '_id firstName lastName email vxCode activeVxCode mainBalance profitBalance referralBalance',
      )
      .lean();

    if (!user) return null;

    const children = await this.referralModel
      .find({ parent: new Types.ObjectId(parentId) })
      .select('position referredUser')
      .populate(
        'referredUser',
        '_id firstName lastName email vxCode activeVxCode mainBalance profitBalance referralBalance',
      )
      .lean();

    const leftChild = children.find((c) => c.position === 'left');
    const rightChild = children.find((c) => c.position === 'right');

    const leftVolume = leftChild?.referredUser
      ? await calculateSubtreeVolume(leftChild.referredUser._id.toString())
      : 0;

    const rightVolume = rightChild?.referredUser
      ? await calculateSubtreeVolume(rightChild.referredUser._id.toString())
      : 0;

    // ✅ FIXED COUNTS
    const leftCount = leftChild?.referredUser
      ? 1 + await calculateSubtreeCount(leftChild.referredUser._id.toString())
      : 0;

    const rightCount = rightChild?.referredUser
      ? 1 + await calculateSubtreeCount(rightChild.referredUser._id.toString())
      : 0;

    const totalCount = leftCount + rightCount;
    const totalTeamVolume = leftVolume + rightVolume;

    const left = leftChild?.referredUser
      ? await buildTree(leftChild.referredUser._id.toString(), level + 1)
      : null;

    const right = rightChild?.referredUser
      ? await buildTree(rightChild.referredUser._id.toString(), level + 1)
      : null;

    return {
      id: user._id.toString(),
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      vxCode: user.activeVxCode ? user.vxCode : null,

      balances: {
        main: user.mainBalance,
        profit: user.profitBalance,
        referral: user.referralBalance,
      },

      volumes: {
        leftVolume,
        rightVolume,
        totalTeamVolume,
      },

      counts: {
        leftCount,
        rightCount,
        totalCount,
      },

      left,
      right,
    };
  };

  const tree = await buildTree(userId);

  this.logger.warn(`🌳 [END] Tree build completed`);

  return tree;
}


  async calculateReferralProfits(fromUserId: string, investmentAmount: number) {
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
        await this.usersService.addBalance(parentId, 'referralBalance', reward);

        await this.usersService.addBalance(parentId, 'maxCapBalance', reward);

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

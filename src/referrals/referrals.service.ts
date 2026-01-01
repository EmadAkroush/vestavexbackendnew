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

  async getReferralStatsCount(userId: string) {
    this.logger.log(
      `🚀 Calculating BINARY referral stats for userId=${userId}`,
    );

    const rootUser = await this.userModel.findById(userId).lean();
    if (!rootUser) {
      this.logger.error(`❌ User not found: ${userId}`);
      throw new Error('User not found');
    }

    let totalNodes = 0;
    let leftCount = 0;
    let rightCount = 0;
    let maxDepth = 0;

    const traverse = async (parentId: string, depth: number): Promise<void> => {
      maxDepth = Math.max(maxDepth, depth);

      const children = await this.referralModel
        .find({ parent: parentId })
        .select('referredUser position')
        .lean();

      for (const child of children) {
        totalNodes++;

        if (child.position === 'left') leftCount++;
        if (child.position === 'right') rightCount++;

        await traverse(child.referredUser.toString(), depth + 1);
      }
    };

    // 🔁 شروع از ریشه
    await traverse(userId, 1);

    this.logger.log(
      `✅ Binary stats: total=${totalNodes}, left=${leftCount}, right=${rightCount}, depth=${maxDepth}`,
    );

    return {
      totalReferrals: totalNodes,
      leftCount,
      rightCount,
      depth: maxDepth,
    };
  }

  // 🟢 محاسبه مجموع سرمایه‌گذاری‌ها در هر سطح
  // 🟢 محاسبه مجموع سرمایه‌گذاری‌های باینری (LEFT / RIGHT) تا بی‌نهایت
  async getReferralEarnings(userId: string) {
    this.logger.log(
      `🚀 Calculating binary referral earnings for userId=${userId}`,
    );

    const rootUser = await this.userModel.findById(userId).lean();
    if (!rootUser) {
      throw new Error('User not found');
    }

    // 🔁 تابع بازگشتی برای جمع‌زدن volume
    const calculateSideVolume = async (
      parentId: string,
      side: 'left' | 'right',
    ): Promise<number> => {
      let total = 0;

      const children = await this.referralModel
        .find({ parent: parentId, position: side })
        .select('referredUser')
        .lean();

      for (const child of children) {
        const userId = child.referredUser.toString();

        // 🔹 سرمایه‌گذاری‌های active کاربر
        const investments =
          await this.investmentsService.getUserInvestments(userId);

        const activeSum = (investments || [])
          .filter((i: any) => i.status === 'active')
          .reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);

        total += activeSum;

        // 🔁 ادامه به عمق
        total += await calculateSideVolume(userId, 'left');
        total += await calculateSideVolume(userId, 'right');
      }

      return total;
    };

    const leftVolume = await calculateSideVolume(userId, 'left');
    const rightVolume = await calculateSideVolume(userId, 'right');

    this.logger.log(
      `📊 Binary volumes for ${userId} → LEFT=${leftVolume}, RIGHT=${rightVolume}`,
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

    const buildTree = async (
      parentId: string,
      level = 1,
    ): Promise<any | null> => {
      this.logger.warn(
        `\n🔁 [LEVEL ${level}] buildTree called with parentId=${parentId}`,
      );

      if (level > depth) {
        this.logger.warn(
          `⛔ [LEVEL ${level}] Max depth reached, stopping recursion`,
        );
        return null;
      }

      // 1️⃣ Load user
      const user = await this.userModel
        .findById(parentId)
        .select(
          '_id firstName lastName email vxCode activeVxCode mainBalance profitBalance referralBalance',
        )
        .lean();

      if (!user) {
        this.logger.error(
          `❌ [LEVEL ${level}] User NOT FOUND for id=${parentId}`,
        );
        return null;
      }

      this.logger.log(
        `👤 [LEVEL ${level}] User loaded: ${user.firstName} ${user.lastName} (${user._id})`,
      );

      // 2️⃣ Load referrals (children)
      const children = await this.referralModel
        .find({ parent: new Types.ObjectId(parentId) })
        .populate(
          'referredUser',
          '_id firstName lastName email vxCode activeVxCode mainBalance profitBalance referralBalance',
        )
        .lean();

      this.logger.log(
        `👶 [LEVEL ${level}] Found ${children.length} referral(s) for parent=${parentId}`,
      );

      children.forEach((c, i) => {
        this.logger.log(
          `   ↳ child[${i}]: referralId=${c._id} position=${c.position} referredUser=${c.referredUser?._id}`,
        );
      });

      const leftChild = children.find((c) => c.position === 'left');
      const rightChild = children.find((c) => c.position === 'right');

      if (!leftChild)
        this.logger.warn(`⚠️ [LEVEL ${level}] LEFT child NOT found`);
      if (!rightChild)
        this.logger.warn(`⚠️ [LEVEL ${level}] RIGHT child NOT found`);

      // 3️⃣ Recursion
      const leftTree =
        leftChild && leftChild.referredUser
          ? await buildTree(leftChild.referredUser._id.toString(), level + 1)
          : null;

      const rightTree =
        rightChild && rightChild.referredUser
          ? await buildTree(rightChild.referredUser._id.toString(), level + 1)
          : null;

      this.logger.warn(`✅ [LEVEL ${level}] Node ready for user=${user._id}`);

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

        left: leftTree,
        right: rightTree,
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

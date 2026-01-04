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

  // 📈 آمار کلی زیرمجموعه‌ها
  async getReferralDashboardStats(userId: string) {
    this.logger.log(`📊 Fetching referral dashboard stats for ${userId}`);

    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException('User not found');

    /* ============================
     📦 LEFT / RIGHT VOLUME
  ============================ */
    // const { leftVolume, rightVolume } = await this.getReferralEarnings(userId);

    // const totalTeamVolume = leftVolume + rightVolume;

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
    // const usedCapacity = Math.min(leftVolume, rightVolume);

    // const flushOut =
    //   leftVolume !== rightVolume ? Math.abs(leftVolume - rightVolume) : 0;

    /* ============================
     🔄 CYCLES
  ============================ */
    // const vxc = Math.floor(usedCapacity / 200);

    /* ============================
     💸 WITHDRAWALS (READ ONLY)
  ============================ */
    const withdrawalTotalBalance = user.withdrawalTotalBalance || 0;

    return {
      accountCapacity,

      totalActiveInvestment,
      withdrawalTotalBalance,
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
        ? 1 +
          (await calculateSubtreeCount(leftChild.referredUser._id.toString()))
        : 0;

      const rightCount = rightChild?.referredUser
        ? 1 +
          (await calculateSubtreeCount(rightChild.referredUser._id.toString()))
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

  async calculateReferralProfits(fromUserId: string) {
    this.logger.log(
      `🔁 Binary profit calculation started from user=${fromUserId}`,
    );

    /**
     * 🔁 محاسبه حجم کل یک زیرشاخه (بازگشتی)
     */
    const calculateSubtreeVolume = async (
      userId: Types.ObjectId,
    ): Promise<number> => {
      let total = 0;

      // 🔹 سرمایه‌گذاری فعال خود این کاربر
      const investments = await this.investmentsService.getUserInvestments(
        userId.toString(),
      );

      const totalActiveInvestment = (investments || [])
        .filter((i) => i.status === 'active')
        .reduce((sum, i) => sum + Number(i.amount || 0), 0);

      total += investments.reduce(
        (sum, inv) => sum + Number(inv.amount || 0),
        0,
      );

      // 🔹 فرزندان مستقیم (left و right)
      const children = await this.referralModel.find({
        parent: userId,
      });

      for (const child of children) {
        total += await calculateSubtreeVolume(
          child.referredUser as Types.ObjectId,
        );
      }

      return total;
    };

    let currentUserId = new Types.ObjectId(fromUserId);
    let level = 1;

    while (true) {
      // ⬆️ پیدا کردن والد (uplink)
      const uplink = await this.referralModel.findOne({
        referredUser: currentUserId,
      });

      if (!uplink || !uplink.parent) {
        this.logger.log(`🛑 Reached root at level ${level}`);
        break;
      }

      const parentId = uplink.parent as Types.ObjectId;

      this.logger.log(
        `⬆️ Level ${level} | child=${currentUserId} → parent=${parentId}`,
      );

      // 🔍 پیدا کردن فرزند چپ و راست والد
      const children = await this.referralModel.find({
        parent: parentId,
      });

      const leftChild = children.find((c) => c.position === 'left');
      const rightChild = children.find((c) => c.position === 'right');

      const leftVolume = leftChild
        ? await calculateSubtreeVolume(leftChild.referredUser as Types.ObjectId)
        : 0;

      const rightVolume = rightChild
        ? await calculateSubtreeVolume(
            rightChild.referredUser as Types.ObjectId,
          )
        : 0;

      this.logger.log(
        `📊 Level ${level} | Parent=${parentId} | Left=${leftVolume} | Right=${rightVolume}`,
      );

      // 💰 محاسبه سود باینری
      const pairable = Math.min(leftVolume, rightVolume);
      const pairs = Math.floor(pairable / 200);
      const reward = pairs * 35;

      if (reward > 0) {
        await this.usersService.addBalance(
          parentId.toString(),
          'referralBalance',
          reward,
        );

        await this.usersService.addBalance(
          parentId.toString(),
          'maxCapBalance',
          reward,
        );

        await this.transactionsService.createTransaction({
          userId: parentId.toString(),
          type: 'binary-profit',
          amount: reward,
          currency: 'USD',
          status: 'completed',
          note: `Binary profit | Level ${level} | Pairs=${pairs} | Left=${leftVolume} | Right=${rightVolume}`,
        });
      } else {
        await this.transactionsService.createTransaction({
          userId: parentId.toString(),
          type: 'binary-profit-skip',
          amount: 0,
          currency: 'USD',
          status: 'skipped',
          note: `Binary not balanced | Level ${level} | Left=${leftVolume} | Right=${rightVolume}`,
        });
      }

      // ⬆️ برو بالا
      currentUserId = parentId;
      level++;
    }

    this.logger.log('✅ Binary profit calculation completed');
  }

  // 🧾 گرفتن تراکنش‌های ریفرال کاربر برای داشبورد
  async getReferralTransactions(userId: string) {
    const transactions =
      await this.transactionsService.getUserTransactions(userId);
    return transactions.filter((tx) => tx.type === 'referral-profit');
  }
}

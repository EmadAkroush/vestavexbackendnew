import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly transactionsService: TransactionsService,
  ) {}

  // 🟢 انتقال از profitBalance → mainBalance
  async transferProfitToMain(userId: string, amount: number) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.profitBalance < amount)
      throw new BadRequestException('Insufficient profit balance');

    // انتقال
    user.profitBalance -= amount;
    user.mainBalance += amount;
    await user.save();

    // 📘 ثبت تراکنش
    await this.transactionsService.createTransaction({
      userId: user._id.toString(),
      type: 'transfer',
      amount,
      currency: 'USD',
      status: 'completed',
      note: `Transferred ${amount} USD from Profit Balance to Main Balance.`,
    });

    return {
      success: true,
      message: `✅ ${amount} USD transferred from Profit to Main balance.`,
      balances: {
        mainBalance: user.mainBalance,
        profitBalance: user.profitBalance,
      },
    };
  }

  // 🟣 انتقال از referralBalance → mainBalance
  async transferReferralToMain(userId: string, amount: number) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.referralBalance < amount)
      throw new BadRequestException('Insufficient referral profit balance');

    user.referralBalance -= amount;
    user.mainBalance += amount;
    await user.save();

    // 📘 ثبت تراکنش
    await this.transactionsService.createTransaction({
      userId: user._id.toString(),
      type: 'transfer',
      amount,
      currency: 'USD',
      status: 'completed',
      note: `Transferred ${amount} USD from Referral Profit to Main Balance.`,
    });

    return {
      success: true,
      message: `✅ ${amount} USD transferred from Referral Profit to Main Balance.`,
      balances: {
        mainBalance: user.mainBalance,
        referralBalance: user.referralBalance,
      },
    };
  }

  // 🟡 انتقال از bonusBalance → mainBalance
  async transferBonusToMain(userId: string, amount: number) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.bonusBalance < amount)
      throw new BadRequestException('Insufficient bonus balance');

    user.bonusBalance -= amount;
    user.mainBalance += amount;
    await user.save();

    // 📘 ثبت تراکنش
    await this.transactionsService.createTransaction({
      userId: user._id.toString(),
      type: 'transfer',
      amount,
      currency: 'USD',
      status: 'completed',
      note: `Transferred ${amount} USD from Bonus Balance to Main Balance.`,
    });

    return {
      success: true,
      message: `✅ ${amount} USD transferred from Bonus Balance to Main Balance.`,
      balances: {
        mainBalance: user.mainBalance,
        bonusBalance: user.bonusBalance,
      },
    };
  }
}

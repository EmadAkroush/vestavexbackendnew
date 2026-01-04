import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Referral } from '../referrals/schemas/referrals.schema';
import { Investment } from '../investments/schemas/investments.schema';
import { UsersService } from '../users/users.service';
import { TransactionsService } from '../transactions/transactions.service';


@Injectable()
export class ReferralProfitsService {
  constructor(
    @InjectModel(Referral.name)
    private readonly referralModel: Model<Referral>,

    @InjectModel(Investment.name)
    private readonly investmentModel: Model<Investment>,

    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService,
  ) {}

  async calculateReferralProfits(fromUserId: string) {
    const calculateLegVolume = async (
      userId: Types.ObjectId,
      position: 'left' | 'right',
    ): Promise<number> => {
      const referrals = await this.referralModel.find({
        parent: userId,
        position,
      });

      let total = 0;

      for (const ref of referrals) {
        const childId = ref.referredUser as Types.ObjectId;

        const investments =
          await this.investmentModel.find({
            user: childId,
            status: 'active',
          });

        const userTotalInvestment = investments.reduce(
          (sum, inv) => sum + Number(inv.amount || 0),
          0,
        );

        total += userTotalInvestment;

        total += await calculateLegVolume(childId, 'left');
        total += await calculateLegVolume(childId, 'right');
      }

      return total;
    };

    let currentUserId = new Types.ObjectId(fromUserId);
    let level = 1;

    while (true) {
      const referral = await this.referralModel.findOne({
        referredUser: currentUserId,
      });

      if (!referral || !referral.parent) break;

      const parentId = referral.parent as Types.ObjectId;

      const leftVolume = await calculateLegVolume(parentId, 'left');
      const rightVolume = await calculateLegVolume(parentId, 'right');

      const pairable = Math.min(leftVolume, rightVolume);
      const pairs = Math.floor(pairable / 200);
      const reward = pairs * 35;

      if (reward > 0) {
        await this.usersService.addBalance(
          parentId.toString(),
          'referralBalance',
          reward,
        );

        await this.transactionsService.createTransaction({
          userId: parentId.toString(),
          type: 'binary-profit',
          amount: reward,
          currency: 'USD',
          status: 'completed',
          note: `Binary profit | Level ${level}`,
        });
      }

      currentUserId = parentId;
      level++;
    }
  }
}

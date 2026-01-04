import { Injectable ,Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Referral } from '../referrals/schemas/referrals.schema';
import { Investment } from '../investments/schemas/investments.schema';
import { UsersService } from '../users/users.service';
import { TransactionsService } from '../transactions/transactions.service';
import { InvestmentsService } from '../investments/investments.service';


@Injectable()
export class ReferralProfitsService {
  private readonly logger = new Logger(ReferralProfitsService.name);
  constructor(
    @InjectModel(Referral.name)
    private readonly referralModel: Model<Referral>,
    @InjectModel(Investment.name)
    private readonly investmentModel: Model<Investment>,
    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService,
    private readonly investmentsService: InvestmentsService,
  ) {}
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
}

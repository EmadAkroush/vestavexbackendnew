import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReferralProfitsService } from './referralprofits.service';
import { Referral, ReferralSchema } from '../referrals/schemas/referrals.schema';
import { Investment, InvestmentSchema } from '../investments/schemas/investments.schema';
import { User, UserSchema } from '../users/schemas/user.schema'; // ✅ اضافه کن
import { UsersModule } from '../users/users.module';
import { TransactionsModule } from '../transactions/transactions.module';


@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Referral.name, schema: ReferralSchema },
      { name: User.name, schema: UserSchema }, // ✅ این خط رو اضافه کن
      { name: Investment.name, schema: InvestmentSchema },
    ]),

    UsersModule,
    TransactionsModule,
  
  ],
  providers: [ReferralProfitsService],
  exports: [ReferralProfitsService], // ✅ خیلی مهم
})
export class ReferralProfitsModule {}

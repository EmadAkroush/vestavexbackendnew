import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReferralProfitsService } from './referralprofits.service';
import { Referral, ReferralSchema } from '../referrals/schemas/referrals.schema';
import { Investment, InvestmentSchema } from '../investments/schemas/investments.schema';
import { UsersModule } from '../users/users.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { InvestmentsModule } from '../investments/investments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Referral.name, schema: ReferralSchema },
      { name: Investment.name, schema: InvestmentSchema },
    ]),

    UsersModule,
    TransactionsModule,
    InvestmentsModule,
  ],
  providers: [ReferralProfitsService],
  exports: [ReferralProfitsService], // ✅ خیلی مهم
})
export class ReferralProfitsModule {}

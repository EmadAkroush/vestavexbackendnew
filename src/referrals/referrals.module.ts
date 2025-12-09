import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';
import { Referral, ReferralSchema } from './schemas/referrals.schema';
import { UsersModule } from '../users/users.module';
import { TransactionsModule } from '../transactions/transactions.module'; 
import { User, UserSchema } from '../users/schemas/user.schema'; // ✅ اضافه کن
import { InvestmentsModule } from 'src/investments/investments.module';
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Referral.name, schema: ReferralSchema },
            { name: User.name, schema: UserSchema }, // ✅ این خط رو اضافه کن
    ]),
    UsersModule,
    TransactionsModule,
    InvestmentsModule
  ],
  providers: [ReferralsService],
  controllers: [ReferralsController],
  exports: [ReferralsService,   MongooseModule ],
})
export class ReferralsModule {}

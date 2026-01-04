import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MongooseModule } from '@nestjs/mongoose';
import { PackagesModule } from './packages/packages.module';
import { InvestmentsModule } from './investments/investments.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ReferralsModule } from './referrals/referrals.module';
import { BonusesModule } from './bonuses/bonuses.module';
import { ActivityModule } from './activity/activity.module';
import { PaymentsModule } from './payments/payments.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReferralProfitsModule } from './referralprofits/referralprofits.module';




@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // ✅ اضافه شد
    AuthModule,
    UsersModule,
    MongooseModule.forRoot('mongodb://localhost:27017/vesta'),
    PackagesModule,
    InvestmentsModule,
    TransactionsModule,
    ReferralsModule,
    BonusesModule,
    ActivityModule,
    PaymentsModule,
    ScheduleModule.forRoot(),
    DashboardModule,
    ReferralProfitsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

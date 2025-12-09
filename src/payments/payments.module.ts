import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { UsersModule } from '../users/users.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { Payment, PaymentSchema } from './payment.schema';
import { ConfigModule } from '@nestjs/config';
import { BonusesModule } from '../bonuses/bonuses.module'; // 👈 اضافه شد



@Module({
  imports: [
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
    UsersModule,
    TransactionsModule,
    ConfigModule,
    BonusesModule, // 👈 اضافه شد تا BonusesService در دسترس باشه
  ],
  providers: [PaymentsService],
  controllers: [PaymentsController],
})
export class PaymentsModule {}

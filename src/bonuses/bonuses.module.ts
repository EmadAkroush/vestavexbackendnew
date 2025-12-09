import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Bonus, BonusSchema } from './schemas/bonuses.schema';
import { BonusesService } from './bonuses.service';
import { BonusesController } from './bonuses.controller';
import { UsersModule } from '../users/users.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Bonus.name, schema: BonusSchema }]),
    UsersModule,
    TransactionsModule,
  ],
  providers: [BonusesService],
  controllers: [BonusesController],
  exports: [BonusesService],
})
export class BonusesModule {}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

@Schema({ timestamps: true })
export class Transaction extends Document {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  userId: string;

  @Prop({ required: true })
  type: string; // deposit, withdraw, profit, referral, bonus

  @Prop({ required: true })
  amount: number; // مبلغ تراکنش

  @Prop({ default: 'pending' })
  status: string; // pending, completed, failed

  @Prop({ default: 'USD' })
  currency: string; // واحد پول (TRX, USD)

  @Prop({ default: null })
  paymentId?: string; // شناسه پرداخت NOWPayments

  @Prop({ default: null })
  statusUrl?: string; // لینک وضعیت پرداخت (invoice URL)

  @Prop({ default: null })
  note?: string; // توضیحات اضافی

  @Prop({ default: null })
  txHash?: string; // هش تراکنش (اگر بلاک‌چینی باشد)
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

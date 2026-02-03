import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Payment extends Document {
  @Prop({ required: true })
  userId: string;

  // مبلغ درخواستی سایت (USD)
  @Prop({ required: true })
  amount: number;

  // مبلغ واقعی پرداخت‌شده (USDT)
  @Prop()
  actualAmount?: number;

  @Prop({ default: 'USD' })
  currency: string;

  // شناسه داخلی پرداخت
  @Prop({ required: true, unique: true })
  paymentId: string;

  @Prop({ default: 'pending' })
  status: 'pending' | 'finished' | 'failed';

  // آدرس دریافت‌کننده (کیف پول بیزینس)
  @Prop({ required: true })
  payAddress: string;

  // USDT
  @Prop({ default: 'USDT' })
  payCurrency: string;

  // آدرس کیف پول کاربر
  @Prop()
  fromAddress?: string;

  // هش تراکنش بلاک‌چین
  @Prop({ unique: true, sparse: true })
  txHash?: string;

  @Prop()
  confirmedAt?: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Payment extends Document {
  @Prop({ required: true })
  userId: string;

  @Prop()
  amount: number;

  @Prop()
  actualAmount: number;

  @Prop({ default: 'TRX' })
  currency: string;



  @Prop({ required: true })
  paymentId: string;

  @Prop({ default: 'waiting' })
  status: string;

  @Prop()
  payAddress?: string;

  
  @Prop()
  payCurrency?: string;

  @Prop()
  payAmount?: number;

  @Prop()
  statusUrl?: string;

  @Prop()
  confirmedAt?: Date;

  @Prop()
  txHash?: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

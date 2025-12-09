import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Bonus extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: string; // کاربری که پاداش گرفته (لیدر)

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  referredUser: string; // زیرمجموعه‌ای که باعث پاداش شد

  @Prop({ type: Number, required: true })
  amount: number; // مبلغ پاداش (مثلاً ۸ دلار)

  @Prop({ default: 'deposit_bonus' })
  type: string; // نوع پاداش

  @Prop({ default: false })
  claimed: boolean; // فقط یک بار

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const BonusSchema = SchemaFactory.createForClass(Bonus);

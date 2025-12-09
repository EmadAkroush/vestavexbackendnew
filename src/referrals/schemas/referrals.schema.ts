import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Referral extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  referrer: Types.ObjectId; // لیدر (کسی که دعوت کرده)

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  referredUser: Types.ObjectId; // کاربر دعوت‌شده

  @Prop({ type: Number, default: 0 })
  profitEarned: number; // سودی که لیدر از این زیرمجموعه گرفته

  @Prop({ type: Date, default: Date.now })
  joinedAt: Date;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);

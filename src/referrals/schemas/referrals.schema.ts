import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Referral extends Document {

  // 🔹 حالت قدیمی (برای سازگاری)
  @Prop({ type: Types.ObjectId, ref: 'User' })
  referrer?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  referredUser: Types.ObjectId;

  // 🔹 باینری پلن (جدید)
  @Prop({ type: Types.ObjectId, ref: 'User' })
  parent?: Types.ObjectId; // uplink (leader)

  @Prop({ enum: ['left', 'right'], index: true })
  position?: 'left' | 'right';

  // 🔹 مالی
  @Prop({ type: Number, default: 0 })
  profitEarned: number;

  @Prop({ type: Date, default: Date.now })
  joinedAt: Date;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);

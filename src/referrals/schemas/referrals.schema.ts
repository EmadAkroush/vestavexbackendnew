import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Referral extends Document {

  /**
   * 🧬 Binary Tree Parent (uplink)
   * هر کاربر فقط می‌تونه یک parent داشته باشه
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  parent: Types.ObjectId;

  /**
   * 👤 Child user
   * هر کاربر فقط یک‌بار می‌تونه داخل درخت باشه
   */
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  referredUser: Types.ObjectId;

  /**
   * 📍 Position in binary tree
   * left | right
   */
  @Prop({
    type: String,
    enum: ['left', 'right'],
    required: true,
    index: true,
  })
  position: 'left' | 'right';

  /**
   * 💰 Binary profit (optional / future use)
   */
  @Prop({ type: Number, default: 0 })
  profitEarned: number;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);

/**
 * 🔒 CRITICAL UNIQUE INDEX
 * هر parent فقط یک left و یک right
 */
ReferralSchema.index(
  { parent: 1, position: 1 },
  { unique: true }
);

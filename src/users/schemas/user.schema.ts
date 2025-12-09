import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose'; // 👈 این خط اضافه شده

@Schema({ timestamps: true })
export class User extends Document {
  // ===== Basic Profile =====
  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop()
  phone?: string;

  @Prop({ default: null })
  avatar?: string;

  @Prop({ required: true })
  password: string;

  // ===== Wallet & Referral =====
  @Prop({ default: null })
  wallet?: string;

  @Prop({ unique: true })
  vxCode: string; // referral code

  @Prop({ default: null })
  referredBy?: string;

  @Prop({
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    default: [],
  })
  referrals: mongoose.Types.ObjectId[];

  // ===== Financial Balances =====
  @Prop({ type: Number, default: 0 })
  mainBalance: number;

  @Prop({ type: Number, default: 0 })
  profitBalance: number;

  @Prop({ type: Number, default: 0 })
  referralBalance: number;

  @Prop({ type: Number, default: 0 })
  bonusBalance: number;

  @Prop({ default: null })
  refreshToken?: string; // هش شده‌ی رفرش‌توکن فعلی کاربر

    @Prop({ default: null })
  verificationToken?: string; // هش شده‌ی رفرش‌توکن فعلی کاربر

  // ===== Security =====
  @Prop({ default: false })
  twoFAEnabled: boolean;

  @Prop({ default: null })
  twoFASecret?: string;

  // ===== Meta =====
  @Prop({ default: 'user' })
  role: string;

  @Prop({ default: Date.now })
  lastLogin: Date;

  @Prop({ default: true })
  isActive: boolean;

    @Prop({ default: true })
  isVerified: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

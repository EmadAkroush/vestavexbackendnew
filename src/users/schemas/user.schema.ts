import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose'; // 👈 این خط اضافه شده

@Schema({ timestamps: true })
export class User extends Document {
  // ===== Basic Profile =====

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ type: String })
  resetPasswordToken: string;

  @Prop({ type: Date })
  resetPasswordExpires: Date;

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

  @Prop({ default: false })
  activeVxCode?: boolean;

  @Prop({ type: Number, default: 0 })
  accountCapacity: number;

  @Prop({ type: Number, default: 0 })
  vxCycle: number;

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
  maxCapBalance: number;

  @Prop({ type: Number, default: 0 })
  withdrawalTotalBalance: number;

  @Prop({ type: Number, default: 0 })
  profitBalance: number;

  @Prop({ type: Number, default: 0 })
  referralBalance: number;

  @Prop({ type: Number, default: 0 })
  bonusBalance: number;

  @Prop({ type: Number, default: 0 })
  totalIncome: number;

  @Prop({ type: Number, default: 0 })
  totalBalance: number;
  
  // ===== Binary Plan Volumes =====
  @Prop({ type: Number, default: 0 })
  leftVolume: number;

  @Prop({ type: Number, default: 0 })
  rightVolume: number;

  @Prop({
    type: {
      left: { type: Number, default: 0 },
      right: { type: Number, default: 0 },
    },
    default: { left: 0, right: 0 },
  })
  binaryMatched: {
    left: number;
    right: number;
  };

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

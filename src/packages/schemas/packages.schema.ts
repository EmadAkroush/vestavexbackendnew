import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Package extends Document {
  @Prop({ required: true, unique: true })
  name: string; // نام پکیج (مثلاً Starter, Growth, Pro)

  @Prop({ required: true })
  range: string; // محدوده مبلغ (مثلاً "$100 - $499")

  @Prop({ required: true })
  dailyRate: number; // درصد سود روزانه (مثلاً 1.5)

  @Prop({ required: true })
  minDeposit: number; // حداقل مبلغ سرمایه‌گذاری

  @Prop({ required: true })
  maxDeposit: number; // حداکثر مبلغ سرمایه‌گذاری

  @Prop({ default: 0 })
  upgradeRate: number; 

  
  @Prop({ default: '' })
  referralRequirement: string; // توضیحات

  @Prop({ default: '' })
  description: string; // توضیحات

  @Prop({ default: true })
  isActive: boolean; // فعال یا غیرفعال بودن پکیج
}

export const PackageSchema = SchemaFactory.createForClass(Package);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Package extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  range: string;

  @Prop({ required: true })
  maxCap: number;

  @Prop({ required: true })
  monthRate: number;

  @Prop({ required: true })
  minDeposit: number;

  @Prop({ required: true })
  maxDeposit: number;




  @Prop({ default: '' })
  description: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const PackageSchema = SchemaFactory.createForClass(Package);

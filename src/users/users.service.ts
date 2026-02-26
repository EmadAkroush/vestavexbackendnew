import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';

import { Model } from 'mongoose';
import { User } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  // 🟢 ایجاد کاربر جدید
  async create(data: Partial<User>): Promise<User> {
    const user = new this.userModel(data);
    return user.save();
  }

  // 🔍 پیدا کردن با ایمیل
  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  // داخل UsersService اضافه کن 👇
  async findByVxCode(vxCode: string): Promise<User | null> {
    return this.userModel.findOne({ vxCode });
  }
  // 🔍 پیدا کردن با ID
  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  // 🔍 پیدا کردن با نام کاربری
  async findByUsername(username: string): Promise<User | null> {
    return this.userModel.findOne({ username }).exec();
  }

  // 🧾 دریافت همه کاربران (برای admin)
  async findAll(): Promise<User[]> {
    return this.userModel.find().select('-password').exec();
  }

  async updateUser(userId: string, data: Partial<User>): Promise<User> {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid update data provided');
    }

    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined && v !== null),
    );

    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // فقط فیلدهایی که تغییر کرده‌اند را آپدیت کن
    Object.assign(user, cleanData);

    // ذخیره با ولیدیشن روی همان فیلدها
    await user.save({ validateModifiedOnly: true });

    return user;
  }

  // 💰 افزودن مبلغ به یکی از حساب‌ها
  async addBalance(
    userId: string,
    type:
      | 'mainBalance'
      | 'profitBalance'
      | 'referralBalance'
      | 'bonusBalance'
      | 'maxCapBalance'
      | 'totalIncome'
      | 'totalBalance',
    amount: number,
  ) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user[type] = (user[type] ?? 0) + amount; // اطمینان از عدد بودن فیلد
    await user.save();
    return user;
  }

  // 🧨 حذف کاربر (در صورت نیاز)
  async deleteUser(id: string) {
    return this.userModel.findByIdAndDelete(id);
  }

  // 🟢 دریافت موجودی‌های حساب کاربر
  async getUserBalances(userId: string) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    return {
      mainBalance: user.mainBalance ?? 0,
      maxCapBalance: user.maxCapBalance ?? 0,
      withdrawalTotalBalance: user.withdrawalTotalBalance ?? 0,
      profitBalance: user.profitBalance ?? 0,
      referralBalance: user.referralBalance ?? 0,
      bonusBalance: user.bonusBalance ?? 0,
    };
  }

  async updatePassword(
    userId: string,
    newPassword: string,
    confirmPassword: string,
  ): Promise<{ message: string }> {
    if (!newPassword || !confirmPassword) {
      throw new BadRequestException('Password is required');
    }

    if (newPassword !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    if (newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;

    await user.save();

    return { message: 'Password updated successfully' };
  }
}

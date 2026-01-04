import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Referral } from '../referrals/schemas/referrals.schema';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as mongoose from 'mongoose';
import { User } from '../users/schemas/user.schema';
import * as nodemailer from 'nodemailer';
import { randomBytes } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios'; // ✅ اضافه شد برای ارتباط با reCAPTCHA API

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel('Referral') private readonly referralModel: Model<Referral>,
    private jwtService: JwtService,
  ) {}
  private readonly logger = new Logger(AuthService.name);
  // ✅ متد جدید برای بررسی reCAPTCHA
  private async verifyRecaptcha(token: string) {
    const secret = process.env.RECAPTCHA_SECRET;
    if (!secret) throw new BadRequestException('Missing reCAPTCHA secret key');

    const response = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify`,
      null,
      {
        params: {
          secret,
          response: token,
        },
      },
    );

    if (!response.data.success) {
      throw new UnauthorizedException('reCAPTCHA verification failed');
    }
  }

     generateUsername = () => {
      return (
        'u' +
         Date.now().toString(36) +
         Math.random().toString(36).substring(2, 6)
      );
    };

  // === Register User ===
  async register(dto: any) {
    const existingUser = await this.userModel.findOne({ email: dto.email });
    if (existingUser) throw new ConflictException('Email already in use');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const vxCode = 'vx-' + Math.floor(100000 + Math.random() * 900000);
    const verificationToken = randomBytes(32).toString('hex');
    const username = this.generateUsername();
    const user = await this.userModel.create({
      username,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      password: hashedPassword,
      vxCode,
      isVerified: false,
      verificationToken,
    });

    // ✅ اگر referrerCode فرستاده شده باشد، بررسی و ثبت شود
    if (dto.referrerCode) {
      const referrer = await this.userModel.findOne({
        vxCode: dto.referrerCode,
      });
      if (referrer) {
        // ثبت رابطه‌ی ارجاع
        user.referredBy = referrer.vxCode;
        await user.save();

        await this.referralModel.create({
          referrer: referrer._id,
          referredUser: user._id,
        });

        referrer.referrals.push(
          new mongoose.Types.ObjectId(user._id.toString()),
        );
        await referrer.save();
      } else {
        // ⚠️ اگر کد لیدر اشتباه بود — برای فرانت اند ارسال شود
        return {
          success: false,
          message: 'Invalid referral code.',
        };
      }
    }

    await this.sendVerificationEmail(user.email, verificationToken);

    const userId = user._id.toString();
    const tokens = await this.generateTokens(userId, user.email);
    await this.updateRefreshToken(userId, tokens.refreshToken);

    return {
      message:
        'Registration successful. Please verify your email before login.',
      user,
    };
  }

  // === Verify Email ===
  async verifyEmail(token: string) {
    const user = await this.userModel.findOne({ verificationToken: token });
    if (!user)
      throw new NotFoundException('Invalid or expired verification token');

    user.set('isVerified', true);
    user.set('verificationToken', null);
    await user.save();

    return { message: 'Email verified successfully. You can now log in.' };
  }

  // === Login User ===
  async login(email: string, password: string, recaptchaToken?: string) {
    // 🧠 بررسی reCAPTCHA قبل از ورود
    // if (!recaptchaToken)
    //   throw new BadRequestException('Missing reCAPTCHA token');
    // await this.verifyRecaptcha(recaptchaToken);

    const user = await this.userModel.findOne({ email });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // ⛔️ جلوگیری از ورود کاربر بلاک‌شده
    if (user.isActive === false)
      throw new UnauthorizedException('Your account has been blocked.');

    const isVerified = (user as any).isVerified;
    if (!isVerified)
      throw new UnauthorizedException('Please verify your email first.');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const userId = user._id.toString();
    const tokens = await this.generateTokens(userId, user.email);
    await this.updateRefreshToken(userId, tokens.refreshToken);

    return { user, ...tokens };
  }

  // === Refresh Token ===
  async refresh(authHeader: string) {
    if (!authHeader || !authHeader.startsWith('Bearer '))
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );

    const refreshToken = authHeader.split(' ')[1];
    if (!refreshToken)
      throw new UnauthorizedException('Refresh token not found');

    let decoded: any;
    try {
      decoded = this.jwtService.verify(refreshToken);
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userModel.findById(decoded.sub);
    if (!user || !user.refreshToken)
      throw new UnauthorizedException('User not found or token missing');

    const isMatch = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isMatch) throw new UnauthorizedException('Token mismatch');

    const tokens = await this.generateTokens(user._id.toString(), user.email);
    await this.updateRefreshToken(user._id.toString(), tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        vxCode: user.vxCode,
        isVerified: user.isVerified,
      },
    };
  }

  // === Logout ===
  async logout(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: null });
    return { message: 'Logged out successfully' };
  }

  // === Forgot Password (Send Reset Email) ===
  async requestPasswordReset(email: string) {
    const user = await this.userModel.findOne({ email });
    if (!user)
      throw new NotFoundException('User with this email does not exist');

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 1000 * 60 * 30); // 30 دقیقه اعتبار

    user.set('resetPasswordToken', resetToken);
    user.set('resetPasswordExpires', resetTokenExpires);
    await user.save();
    this.logger.log(`Saved token: ${(user as any).resetPasswordToken}`);
    await this.sendResetPasswordEmail(user.email, resetToken, user.firstName);

    return { message: 'Password reset email sent successfully' };
  }

  // === Verify Reset Token ===
  async verifyResetToken(token: string) {
    const user = await this.userModel.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) throw new BadRequestException('Invalid or expired reset token');

    return {
      message: 'Reset token is valid',
      email: user.email,
    };
  }

  // === Reset Password ===
  async resetPassword(token: string, newPassword: string) {
    this.logger.log(`Reset password requested with token: ${token}`);

    try {
      const user = await this.userModel.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: new Date() },
      });

      if (!user) {
        this.logger.warn(`Invalid or expired reset token: ${token}`);
        throw new BadRequestException('Invalid or expired reset token');
      }

      this.logger.log(`User found for reset password. userId=${user._id}`);

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      this.logger.debug(`Password hashed successfully for userId=${user._id}`);

      user.set('password', hashedPassword);
      user.set('resetPasswordToken', null);
      user.set('resetPasswordExpires', null);

      await user.save();
      this.logger.log(`Password reset successfully for userId=${user._id}`);

      return {
        message: 'Password reset successfully. You can now log in.',
      };
    } catch (error) {
      this.logger.error(`Reset password failed. token=${token}`, error.stack);

      if (error instanceof BadRequestException) {
        throw error;
      }
    }
  }

  // === Token Helpers ===
  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '1h' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    return { accessToken, refreshToken };
  }

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const hashed = await bcrypt.hash(refreshToken, 10);
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: hashed });
  }

  // === Send Verification Email ===
  private async sendVerificationEmail(email: string, token: string) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    const mailOptions = {
      from: `"finalxcard Support" <${process.env.MAIL_USER}>`,
      to: email,
      subject: 'Your finalxcard Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #0b0f14; color: #e5fff7;">
          <h2 style="color:#2ff1b4;">Welcome to finalxcard</h2>
          <p style="font-size:15px;">Please use the verification code below to verify your email address.</p>

          <div style="margin:25px 0; text-align:center;">
            <div style="
              display:inline-block;
              background:#1a2b23;
              border:2px dashed #2ff1b4;
              color:#2ff1b4;
              font-size:18px;
              font-weight:bold;
              letter-spacing:2px;
              padding:12px 20px;
              border-radius:8px;
            ">
              ${token}
            </div>
          </div>

          <p style="font-size:14px;color:#9fc9b7;">
            Copy the above code and paste it into the verification form in your finalxcard account.
          </p>

          <hr style="border:0;border-top:1px solid #2ff1b422;margin:25px 0;">
          <p style="font-size:12px;color:#6b8a7c;">
            If you did not request this, please ignore this email.
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
  }

  // === Send Password Reset Email ===
  private async sendResetPasswordEmail(
    email: string,
    token: string,
    firstName?: string,
  ) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    const resetUrl = `${process.env.FRONTEND_URL}/resetpassword?token=${token}`;
    const name = firstName || 'User';

    // ============================
    // 🔥 HTML Template Inline (English)
    // ============================
    const html = `
  <div style="font-family: Arial, sans-serif; direction: ltr; text-align: left; background:#f5f5f5; padding:40px;">
    <div style="max-width:600px; margin:auto; background:white; border-radius:12px; padding:30px; border:1px solid #eee;">
      
      <h2 style="color:#0b6d20;">Hello ${name} 🌿</h2>

      <p style="font-size:15px; color:#333;">
        A password reset request has been submitted for your account at <strong>finalxcard</strong>.
      </p>

      <p style="font-size:15px; color:#333;">
        To reset your password, simply click the button below:
      </p>

      <div style="text-align:center; margin:35px 0;">
        <a href="${resetUrl}" 
          style="background:#0b6d20; color:white; padding:14px 28px; font-size:16px; border-radius:8px; text-decoration:none;">
          Reset Password
        </a>
      </div>

      <p style="font-size:13px; color:#777;">
        If you did not request this action, please ignore this email.
      </p>

      <hr style="margin:25px 0; border:0; border-top:1px solid #eee;" />

      <p style="font-size:12px; color:#999; text-align:center;">
        finalxcard Support Team 🌱<br/>
        This link is valid for 1 hour.
      </p>

    </div>
  </div>
  `;

    const mailOptions = {
      from: `"finalxcard Support" <${process.env.MAIL_USER}>`,
      to: email,
      subject: 'Password Reset — finalxcard',
      html,
    };

    await transporter.sendMail(mailOptions);
  }
}

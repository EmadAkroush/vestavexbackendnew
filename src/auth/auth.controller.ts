import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Get,
  Query,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 🟢 Register new user
  @Post('register')
  async register(@Body() dto: RegisterDto ) {
    // ارسال توکن reCAPTCHA به سرویس احراز هویت
    return this.authService.register(dto);
  }

  // 🟡 Verify email via token (from body instead of query)
  @Post('verifyemail')
  async verifyEmail(@Body('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  // 🟢 Login
  @Post('login')
  async login(@Body() dto: LoginDto & { recaptchaToken?: string }) {
    // ارسال توکن reCAPTCHA به سرویس احراز هویت
    return this.authService.login(dto.email, dto.password, dto.recaptchaToken);
  }

  // 🟠 Refresh JWT tokens
  @Get('refresh')
  async refresh(@Req() req: Request) {
    const authHeader =
      (req.headers['authorization'] || req.headers['Authorization']) as string;
    return this.authService.refresh(authHeader);
  }

  // 🔴 Logout (requires valid JWT)
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: any) {
    return this.authService.logout(req.user.sub);
  }

  // 🔵 Forgot password — send reset email
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  // 🟢 Verify reset token — check token validity before reset
  @Get('verify-reset')
  async verifyReset(@Query('token') token: string) {
    return this.authService.verifyResetToken(token);
  }

  // 🟣 Reset password — after token verification
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }
}

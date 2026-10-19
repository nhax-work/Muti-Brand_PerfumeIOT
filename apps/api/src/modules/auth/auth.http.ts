/**
 * Cửa vào HTTP của module auth. Mỏng có chủ ý (QT2): đọc và kiểm dữ liệu vào, trích nguồn gốc yêu
 * cầu, gọi AuthService. Không chứa luật nghiệp vụ nào.
 *
 * Đường dẫn và hình dạng dữ liệu theo đúng spec/contracts/openapi.yaml, nhóm tag AUTH.
 */

import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type {
  BrandRegistered,
  CurrentUser as CurrentUserDto,
  ReauthResponse,
  TokenPair,
} from '@scentstation/contracts';
import { z } from 'zod';
import { originOf } from '../../shared/http/request-origin.js';
import { parseBody } from '../../shared/http/validation.js';
import { AuthService } from './auth.service.js';
import { AllowPendingPasswordChange, CurrentUser, Public } from './decorators.js';
import type { AuthenticatedUser } from './principal.loader.js';

/** openapi.yaml: LoginRequest — password có minLength 8. */
const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const RefreshBody = z.object({ refreshToken: z.string().min(1) });

/** openapi.yaml: ChangePasswordRequest — newPassword có minLength 8. */
const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

/** openapi.yaml: ReauthRequest. */
const ReauthBody = z.object({ password: z.string().min(1) });

/** openapi.yaml: BrandRegistration. */
const RegisterBrandBody = z.object({
  brandName: z.string().trim().min(1).max(200),
  fullName: z.string().trim().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8),
});

/** openapi.yaml: EmailVerificationConfirm — token có minLength 16. */
const VerifyEmailBody = z.object({ token: z.string().min(16) });

type HttpRequest = Parameters<typeof originOf>[0];

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /** FR-USR-06, FR-AUTH-05 (ADR-0013) */
  @Public()
  @Post('register-brand')
  @HttpCode(201)
  registerBrand(@Body() body: unknown, @Req() request: HttpRequest): Promise<BrandRegistered> {
    const data = parseBody(RegisterBrandBody, body);
    return this.auth.registerBrand(data, originOf(request));
  }

  /** FR-USR-07 */
  @Public()
  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body() body: unknown): Promise<void> {
    const { token } = parseBody(VerifyEmailBody, body);
    await this.auth.verifyEmail(token);
  }

  /** FR-USR-07 */
  @Post('verify-email/resend')
  @HttpCode(204)
  async resendVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: HttpRequest,
  ): Promise<void> {
    await this.auth.resendVerification(user, originOf(request));
  }

  /** FR-AUTH-01, FR-AUTH-02, FR-AUTH-03 */
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown, @Req() request: HttpRequest): Promise<TokenPair> {
    const { email, password } = parseBody(LoginBody, body);
    return this.auth.login(email, password, originOf(request));
  }

  /** FR-AUTH-02 */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown): Promise<TokenPair> {
    const { refreshToken } = parseBody(RefreshBody, body);
    return this.auth.refresh(refreshToken);
  }

  /** FR-AUTH-04 */
  @AllowPendingPasswordChange()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthenticatedUser, @Req() request: HttpRequest): Promise<void> {
    await this.auth.logout(user, originOf(request));
  }

  /** FR-AUTH-09 */
  @Post('reauth')
  @HttpCode(200)
  reauth(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Req() request: HttpRequest,
  ): Promise<ReauthResponse> {
    const { password } = parseBody(ReauthBody, body);
    return this.auth.reauthenticate(user, password, originOf(request));
  }

  /** ADR-0004 */
  @AllowPendingPasswordChange()
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Req() request: HttpRequest,
  ): Promise<void> {
    const { currentPassword, newPassword } = parseBody(ChangePasswordBody, body);
    await this.auth.changePassword(user, currentPassword, newPassword, originOf(request));
  }

  /** FR-AUTH-05, FR-AUTH-06 */
  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): CurrentUserDto {
    return this.auth.toCurrentUser(user);
  }
}

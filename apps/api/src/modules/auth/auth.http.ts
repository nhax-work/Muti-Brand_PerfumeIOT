/**
 * Cửa vào HTTP của module auth. Mỏng có chủ ý (QT2): đọc và kiểm dữ liệu vào, trích nguồn gốc yêu
 * cầu, gọi AuthService. Không chứa luật nghiệp vụ nào.
 *
 * Đường dẫn và hình dạng dữ liệu theo đúng spec/contracts/openapi.yaml, nhóm tag AUTH.
 */

import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type {
  CurrentUser as CurrentUserDto,
  ReauthResponse,
  TokenPair,
} from '@scentstation/contracts';
import { z } from 'zod';
import { originOf } from '../../shared/http/request-origin.js';
import { parseBody } from '../../shared/http/validation.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, Public } from './decorators.js';
import type { AuthenticatedUser } from './principal.loader.js';

/** openapi.yaml: LoginRequest — password có minLength 8. */
const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const RefreshBody = z.object({ refreshToken: z.string().min(1) });

/** openapi.yaml: ReauthRequest. */
const ReauthBody = z.object({ password: z.string().min(1) });

type HttpRequest = Parameters<typeof originOf>[0];

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

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

  /** FR-AUTH-05, FR-AUTH-06 */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): CurrentUserDto {
    return this.auth.toCurrentUser(user);
  }
}

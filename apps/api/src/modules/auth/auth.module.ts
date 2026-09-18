import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './access.guard.js';
import { AuthController } from './auth.http.js';
import { AuthQueries } from './auth.queries.js';
import { AuthService } from './auth.service.js';
import { tokenServiceProvider } from './auth.tokens.provider.js';
import { PrincipalLoader } from './principal.loader.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthQueries,
    PrincipalLoader,
    tokenServiceProvider,
    AuthService,
    // Guard toàn cục: MỌI endpoint của MỌI module đều qua đây, trừ endpoint gắn @Public().
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}

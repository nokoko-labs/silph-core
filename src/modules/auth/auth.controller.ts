import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { LocalAuthGuard } from '@/common/guards/local-auth.guard';
import type { JwtPayload } from './auth.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 201, description: 'Returns JWT access token' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  login(@Request() req: { user: User }, @Body() _loginDto: LoginDto) {
    return this.authService.login(req.user);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Get current user from JWT' })
  @ApiResponse({ status: 200, description: 'Returns current user payload' })
  @ApiResponse({ status: 401, description: 'Unauthorized (missing or invalid token)' })
  getProfile(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }
}

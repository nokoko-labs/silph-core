import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { JwtPayload } from '@/modules/auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<UserResponseDto> {
    if (currentUser.status !== 'ACTIVE') {
      throw new ForbiddenException('Only active admins can create users');
    }
    // Ensure the new user is in the same tenant
    return this.usersService.create({ ...createUserDto, tenantId: currentUser.tenantId });
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, type: [UserResponseDto] })
  async findAll(@CurrentUser() user: JwtPayload): Promise<UserResponseDto[]> {
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Only active admins can list users');
    }
    return this.usersService.findAll(user.tenantId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.findOne(id);

    // Rule: ADMIN + ACTIVE + same tenant
    const isAdminOfSameTenant =
      currentUser.role === Role.ADMIN &&
      currentUser.status === 'ACTIVE' &&
      currentUser.tenantId === user.tenantId;

    if (!isAdminOfSameTenant) {
      throw new ForbiddenException('Access denied');
    }

    return user;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Update a user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.findOne(id);

    const isSelf = currentUser.sub === id;
    const isAdminOfSameTenant =
      currentUser.role === Role.ADMIN && currentUser.tenantId === user.tenantId;

    if (!isSelf && !isAdminOfSameTenant) {
      throw new ForbiddenException('Access denied');
    }

    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Delete a user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.findOne(id);

    const isSelf = currentUser.sub === id;
    const isAdminOfSameTenant =
      currentUser.role === Role.ADMIN && currentUser.tenantId === user.tenantId;

    if (!isSelf && !isAdminOfSameTenant) {
      throw new ForbiddenException('Access denied');
    }

    return this.usersService.remove(id);
  }
}

import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { User, UserStatus } from '../entities/User';
import { UserPreference } from '../entities/UserPreference';
import { EmailAddress } from '../entities/EmailAddress';
import { Group } from '../entities/Group';
import { Member } from '../entities/Member';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { hashPassword, validatePassword } from '../utils/password.util';
import { AuthRequest } from '../middleware/auth.middleware';
import { Like } from 'typeorm';

// Get all users
export const getAllUsers = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page = 1, limit = 25, search = '', status = '' } = req.query;
  
  const userRepository = AppDataSource.getRepository(User);
  
  // Only admins can access user list
  if (!req.user?.admin) {
    throw new AppError('管理者権限が必要です', 403);
  }

  const queryBuilder = userRepository
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.groups', 'groups')
    .leftJoinAndSelect('user.preference', 'preference')
    .select([
      'user.id',
      'user.login',
      'user.email',
      'user.firstName',
      'user.lastName',
      'user.admin',
      'user.status',
      'user.language',
      'user.createdOn',
      'user.lastLoginOn',
      'groups.id',
      'groups.name',
    ]);

  // Search filter
  if (search) {
    queryBuilder.where(
      '(user.login LIKE :search OR user.email LIKE :search OR user.firstName LIKE :search OR user.lastName LIKE :search)',
      { search: `%${search}%` }
    );
  }

  // Status filter
  if (status) {
    queryBuilder.andWhere('user.status = :status', { status: parseInt(status as string) });
  }

  // Pagination
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [users, total] = await queryBuilder
    .skip(skip)
    .take(limitNum)
    .orderBy('user.id', 'DESC')
    .getManyAndCount();

  res.json({
    status: 'success',
    data: {
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
  });
});

// Get user by ID
export const getUserById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Only admin or the user themselves can view user details
  const requestedUserId = parseInt(id);
  if (!req.user?.admin && req.user?.id !== requestedUserId) {
    throw new AppError('他のユーザーの情報にアクセスする権限がありません', 403);
  }

  const userRepository = AppDataSource.getRepository(User);
  const selectFields: any = {
    id: true,
    login: true,
    firstName: true,
    lastName: true,
    admin: true,
    status: true,
    language: true,
    createdOn: true,
    lastLoginOn: true,
  };

  // Only include email if admin or self
  if (req.user?.admin || req.user?.id === requestedUserId) {
    selectFields.email = true;
  }

  const user = await userRepository.findOne({
    where: { id: requestedUserId },
    relations: ['groups', 'preference', 'emailAddresses', 'members', 'members.project'],
    select: selectFields,
  });

  if (!user) {
    throw new AppError('ユーザーが見つかりません', 404);
  }

  res.json({
    status: 'success',
    data: { user },
  });
});

// Create user (admin only)
export const createUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    login,
    email,
    password,
    firstName,
    lastName,
    admin = false,
    language = 'ja',
    status = UserStatus.ACTIVE,
    groupIds = [],
  } = req.body;

  // Validate password
  if (!validatePassword(password)) {
    throw new AppError('パスワードは8文字以上である必要があります', 400);
  }

  const userRepository = AppDataSource.getRepository(User);
  const emailRepository = AppDataSource.getRepository(EmailAddress);
  const groupRepository = AppDataSource.getRepository(Group);

  // Check if user exists
  const existingUser = await userRepository.findOne({
    where: [{ login }, { email }],
  });

  if (existingUser) {
    throw new AppError('ユーザー名またはメールアドレスは既に使用されています', 400);
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create user
  const user = userRepository.create({
    login,
    email,
    hashedPassword,
    firstName,
    lastName,
    admin,
    language,
    status,
  });

  await userRepository.save(user);

  // Create email address
  const emailAddress = emailRepository.create({
    userId: user.id,
    address: email,
    isDefault: true,
    notify: true,
  });

  await emailRepository.save(emailAddress);

  // Create user preference
  const preferenceRepository = AppDataSource.getRepository(UserPreference);
  const preference = preferenceRepository.create({
    userId: user.id,
  });

  await preferenceRepository.save(preference);

  // Add to groups
  if (groupIds.length > 0) {
    const groups = await groupRepository.findByIds(groupIds);
    user.groups = groups;
    await userRepository.save(user);
  }

  res.status(201).json({
    status: 'success',
    message: 'ユーザーを作成しました',
    data: {
      user: {
        id: user.id,
        login: user.login,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        admin: user.admin,
      },
    },
  });
});

// Update user
export const updateUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    email,
    firstName,
    lastName,
    admin,
    language,
    status,
    password,
    groupIds,
  } = req.body;

  const userRepository = AppDataSource.getRepository(User);
  const user = await userRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['groups'],
  });

  if (!user) {
    throw new AppError('ユーザーが見つかりません', 404);
  }

  // Only admin can update other users or change admin status
  if (req.user?.id !== user.id && !req.user?.admin) {
    throw new AppError('権限がありません', 403);
  }

  // Update fields
  if (email !== undefined) user.email = email;
  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (language !== undefined) user.language = language;

  // Admin-only fields
  if (req.user?.admin) {
    if (admin !== undefined) user.admin = admin;
    if (status !== undefined) user.status = status;
  }

  // Update password if provided
  if (password) {
    if (!validatePassword(password)) {
      throw new AppError('パスワードは8文字以上である必要があります', 400);
    }
    user.hashedPassword = await hashPassword(password);
    user.passwdChangedOn = new Date();
  }

  // Update groups (admin only)
  if (groupIds !== undefined && req.user?.admin) {
    const groupRepository = AppDataSource.getRepository(Group);
    const groups = await groupRepository.findByIds(groupIds);
    user.groups = groups;
  }

  await userRepository.save(user);

  res.json({
    status: 'success',
    message: 'ユーザー情報を更新しました',
    data: {
      user: {
        id: user.id,
        login: user.login,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        admin: user.admin,
        status: user.status,
      },
    },
  });
});

// Delete user (admin only)
export const deleteUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const userRepository = AppDataSource.getRepository(User);
  const user = await userRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!user) {
    throw new AppError('ユーザーが見つかりません', 404);
  }

  // Cannot delete yourself
  if (req.user?.id === user.id) {
    throw new AppError('自分自身を削除することはできません', 400);
  }

  // Soft delete by setting status to locked
  user.status = UserStatus.LOCKED;
  await userRepository.save(user);

  res.json({
    status: 'success',
    message: 'ユーザーを削除しました',
  });
});

// Get user's projects
export const getUserProjects = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const memberRepository = AppDataSource.getRepository(Member);
  const members = await memberRepository.find({
    where: { userId: parseInt(id) },
    relations: ['project', 'memberRoles', 'memberRoles.role'],
  });

  const projects = members.map((member) => ({
    ...member.project,
    roles: member.memberRoles.map((mr) => mr.role),
  }));

  res.json({
    status: 'success',
    data: { projects },
  });
});

// Lock/Unlock user (admin only)
export const toggleUserLock = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const userRepository = AppDataSource.getRepository(User);
  const user = await userRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!user) {
    throw new AppError('ユーザーが見つかりません', 404);
  }

  if (req.user?.id === user.id) {
    throw new AppError('自分自身をロック/アンロックすることはできません', 400);
  }

  // Toggle status
  if (user.status === UserStatus.LOCKED) {
    user.status = UserStatus.ACTIVE;
  } else {
    user.status = UserStatus.LOCKED;
  }

  await userRepository.save(user);

  res.json({
    status: 'success',
    message: user.status === UserStatus.LOCKED ? 'ユーザーをロックしました' : 'ユーザーのロックを解除しました',
    data: {
      user: {
        id: user.id,
        status: user.status,
      },
    },
  });
});

import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Group } from '../entities/Group';
import { User } from '../entities/User';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get all groups
export const getAllGroups = catchAsync(async (req: AuthRequest, res: Response) => {
  const groupRepository = AppDataSource.getRepository(Group);
  const groups = await groupRepository.find({
    relations: ['users'],
    order: { id: 'ASC' },
  });

  res.json({
    status: 'success',
    data: { groups },
  });
});

// Get group by ID
export const getGroupById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const groupRepository = AppDataSource.getRepository(Group);
  const group = await groupRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['users'],
  });

  if (!group) {
    throw new AppError('グループが見つかりません', 404);
  }

  res.json({
    status: 'success',
    data: { group },
  });
});

// Create group (admin only)
export const createGroup = catchAsync(async (req: AuthRequest, res: Response) => {
  const { name, description, lastName = '', userIds = [] } = req.body;

  if (!name) {
    throw new AppError('グループ名は必須です', 400);
  }

  const groupRepository = AppDataSource.getRepository(Group);
  const userRepository = AppDataSource.getRepository(User);

  // Check if group name exists
  const existingGroup = await groupRepository.findOne({ where: { name } });
  if (existingGroup) {
    throw new AppError('このグループ名は既に使用されています', 400);
  }

  // Create group
  const group = groupRepository.create({
    name,
    description,
    lastName,
  });

  // Add users if provided
  if (userIds.length > 0) {
    const users = await userRepository.findByIds(userIds);
    group.users = users;
  }

  await groupRepository.save(group);

  res.status(201).json({
    status: 'success',
    message: 'グループを作成しました',
    data: { group },
  });
});

// Update group (admin only)
export const updateGroup = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, description, lastName, userIds } = req.body;

  const groupRepository = AppDataSource.getRepository(Group);
  const group = await groupRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['users'],
  });

  if (!group) {
    throw new AppError('グループが見つかりません', 404);
  }

  // Update fields
  if (name !== undefined) group.name = name;
  if (description !== undefined) group.description = description;
  if (lastName !== undefined) group.lastName = lastName;

  // Update users
  if (userIds !== undefined) {
    const userRepository = AppDataSource.getRepository(User);
    const users = await userRepository.findByIds(userIds);
    group.users = users;
  }

  await groupRepository.save(group);

  res.json({
    status: 'success',
    message: 'グループを更新しました',
    data: { group },
  });
});

// Delete group (admin only)
export const deleteGroup = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const groupRepository = AppDataSource.getRepository(Group);
  const group = await groupRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!group) {
    throw new AppError('グループが見つかりません', 404);
  }

  await groupRepository.remove(group);

  res.json({
    status: 'success',
    message: 'グループを削除しました',
  });
});

// Add user to group (admin only)
export const addUserToGroup = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;

  if (!userId) {
    throw new AppError('ユーザーIDは必須です', 400);
  }

  const groupRepository = AppDataSource.getRepository(Group);
  const userRepository = AppDataSource.getRepository(User);

  const group = await groupRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['users'],
  });

  if (!group) {
    throw new AppError('グループが見つかりません', 404);
  }

  const user = await userRepository.findOne({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError('ユーザーが見つかりません', 404);
  }

  // Check if user is already in group
  if (group.users.some((u) => u.id === userId)) {
    throw new AppError('ユーザーは既にこのグループに所属しています', 400);
  }

  group.users.push(user);
  await groupRepository.save(group);

  res.json({
    status: 'success',
    message: 'ユーザーをグループに追加しました',
    data: { group },
  });
});

// Remove user from group (admin only)
export const removeUserFromGroup = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id, userId } = req.params;

  const groupRepository = AppDataSource.getRepository(Group);
  const group = await groupRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['users'],
  });

  if (!group) {
    throw new AppError('グループが見つかりません', 404);
  }

  group.users = group.users.filter((u) => u.id !== parseInt(userId));
  await groupRepository.save(group);

  res.json({
    status: 'success',
    message: 'ユーザーをグループから削除しました',
    data: { group },
  });
});

// Get group users
export const getGroupUsers = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const groupRepository = AppDataSource.getRepository(Group);
  const group = await groupRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['users'],
  });

  if (!group) {
    throw new AppError('グループが見つかりません', 404);
  }

  res.json({
    status: 'success',
    data: { users: group.users },
  });
});

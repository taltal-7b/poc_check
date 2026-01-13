import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Member } from '../entities/Member';
import { MemberRole } from '../entities/MemberRole';
import { Role } from '../entities/Role';
import { User } from '../entities/User';
import { Project } from '../entities/Project';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get project members
export const getProjectMembers = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;

  const memberRepository = AppDataSource.getRepository(Member);
  const members = await memberRepository.find({
    where: { projectId: parseInt(projectId) },
    relations: ['user', 'memberRoles', 'memberRoles.role'],
    order: { id: 'ASC' },
  });

  res.json({
    status: 'success',
    data: { members },
  });
});

// Get member by ID
export const getMemberById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId, memberId } = req.params;

  const memberRepository = AppDataSource.getRepository(Member);
  const member = await memberRepository.findOne({
    where: {
      id: parseInt(memberId),
      projectId: parseInt(projectId),
    },
    relations: ['user', 'memberRoles', 'memberRoles.role'],
  });

  if (!member) {
    throw new AppError('メンバーが見つかりません', 404);
  }

  res.json({
    status: 'success',
    data: { member },
  });
});

// Add member to project
export const addMember = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  const { userId, roleIds = [] } = req.body;

  if (!userId) {
    throw new AppError('ユーザーIDは必須です', 400);
  }

  if (roleIds.length === 0) {
    throw new AppError('少なくとも1つのロールを指定してください', 400);
  }

  const memberRepository = AppDataSource.getRepository(Member);
  const memberRoleRepository = AppDataSource.getRepository(MemberRole);
  const userRepository = AppDataSource.getRepository(User);
  const roleRepository = AppDataSource.getRepository(Role);
  const projectRepository = AppDataSource.getRepository(Project);

  // Check if user exists
  const user = await userRepository.findOne({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError('ユーザーが見つかりません', 404);
  }

  // Check if project exists
  const project = await projectRepository.findOne({
    where: { id: parseInt(projectId) },
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  // Check if already a member
  const existingMember = await memberRepository.findOne({
    where: {
      userId,
      projectId: parseInt(projectId),
    },
  });

  if (existingMember) {
    throw new AppError('このユーザーは既にメンバーです', 400);
  }

  // Create member
  const member = memberRepository.create({
    userId,
    projectId: parseInt(projectId),
  });

  await memberRepository.save(member);

  // Add roles
  for (const roleId of roleIds) {
    const role = await roleRepository.findOne({
      where: { id: roleId },
    });

    if (role) {
      const memberRole = memberRoleRepository.create({
        memberId: member.id,
        roleId: role.id,
      });
      await memberRoleRepository.save(memberRole);
    }
  }

  // Reload with relations
  const savedMember = await memberRepository.findOne({
    where: { id: member.id },
    relations: ['user', 'memberRoles', 'memberRoles.role'],
  });

  res.status(201).json({
    status: 'success',
    message: 'メンバーを追加しました',
    data: { member: savedMember },
  });
});

// Update member roles
export const updateMemberRoles = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId, memberId } = req.params;
  const { roleIds = [] } = req.body;

  if (roleIds.length === 0) {
    throw new AppError('少なくとも1つのロールを指定してください', 400);
  }

  const memberRepository = AppDataSource.getRepository(Member);
  const memberRoleRepository = AppDataSource.getRepository(MemberRole);
  const roleRepository = AppDataSource.getRepository(Role);

  const member = await memberRepository.findOne({
    where: {
      id: parseInt(memberId),
      projectId: parseInt(projectId),
    },
    relations: ['memberRoles'],
  });

  if (!member) {
    throw new AppError('メンバーが見つかりません', 404);
  }

  // Delete existing roles
  await memberRoleRepository.delete({ memberId: member.id });

  // Add new roles
  for (const roleId of roleIds) {
    const role = await roleRepository.findOne({
      where: { id: roleId },
    });

    if (role) {
      const memberRole = memberRoleRepository.create({
        memberId: member.id,
        roleId: role.id,
      });
      await memberRoleRepository.save(memberRole);
    }
  }

  // Reload with relations
  const updatedMember = await memberRepository.findOne({
    where: { id: member.id },
    relations: ['user', 'memberRoles', 'memberRoles.role'],
  });

  res.json({
    status: 'success',
    message: 'メンバーのロールを更新しました',
    data: { member: updatedMember },
  });
});

// Remove member from project
export const removeMember = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId, memberId } = req.params;

  const memberRepository = AppDataSource.getRepository(Member);
  const member = await memberRepository.findOne({
    where: {
      id: parseInt(memberId),
      projectId: parseInt(projectId),
    },
  });

  if (!member) {
    throw new AppError('メンバーが見つかりません', 404);
  }

  // Cannot remove yourself if you're the only manager
  if (req.user?.id === member.userId) {
    const memberRoleRepository = AppDataSource.getRepository(MemberRole);
    const roleRepository = AppDataSource.getRepository(Role);

    const allMembers = await memberRepository.find({
      where: { projectId: parseInt(projectId) },
      relations: ['memberRoles', 'memberRoles.role'],
    });

    // Count members with manager permission
    let managerCount = 0;
    for (const m of allMembers) {
      for (const mr of m.memberRoles) {
        if (mr.role.hasPermission('edit_project')) {
          managerCount++;
          break;
        }
      }
    }

    if (managerCount <= 1) {
      throw new AppError('プロジェクトには少なくとも1人の管理者が必要です', 400);
    }
  }

  await memberRepository.remove(member);

  res.json({
    status: 'success',
    message: 'メンバーを削除しました',
  });
});

// Autocomplete for adding members
export const autocompleteMembersToAdd = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  const { search = '' } = req.query;

  const userRepository = AppDataSource.getRepository(User);
  const memberRepository = AppDataSource.getRepository(Member);

  // Get existing member user IDs
  const existingMembers = await memberRepository.find({
    where: { projectId: parseInt(projectId) },
    select: ['userId'],
  });

  const existingUserIds = existingMembers.map((m) => m.userId);

  // Find users that are not already members
  const queryBuilder = userRepository
    .createQueryBuilder('user')
    .select(['user.id', 'user.login', 'user.firstName', 'user.lastName', 'user.email'])
    .where('user.status = :status', { status: 1 }); // Active users only

  if (existingUserIds.length > 0) {
    queryBuilder.andWhere('user.id NOT IN (:...ids)', { ids: existingUserIds });
  }

  if (search) {
    queryBuilder.andWhere(
      '(user.login LIKE :search OR user.firstName LIKE :search OR user.lastName LIKE :search OR user.email LIKE :search)',
      { search: `%${search}%` }
    );
  }

  const users = await queryBuilder.take(20).getMany();

  res.json({
    status: 'success',
    data: { users },
  });
});

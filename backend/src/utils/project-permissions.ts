import { prisma } from './db';

const ADMIN_BYPASS = '*';
const MANAGE_PROJECT_PERMISSION = 'manage_project';

type MemberRoleShape = {
  role: {
    name: string;
    permissions: unknown;
  } | null;
};

function parseRolePermissions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export async function getUserGroupIds(userId: string): Promise<string[]> {
  const rows = await prisma.groupUser.findMany({
    where: { userId },
    select: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

async function getProjectMemberRoles(userId: string, projectId: string): Promise<MemberRoleShape[]> {
  const groupIds = await getUserGroupIds(userId);
  const members = await prisma.member.findMany({
    where: {
      projectId,
      OR: [{ userId }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])],
    },
    include: {
      memberRoles: {
        include: {
          role: { select: { name: true, permissions: true } },
        },
      },
    },
  });
  return members.flatMap((member) => member.memberRoles ?? []);
}

export async function getUserProjectPermissionSet(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  projectId: string,
): Promise<Set<string> | null> {
  if (isAdmin) return new Set([ADMIN_BYPASS]);
  if (!userId) return null;

  const roles = await getProjectMemberRoles(userId, projectId);
  if (!roles.length) return null;

  const perms = new Set<string>();
  for (const memberRole of roles) {
    for (const permission of parseRolePermissions(memberRole.role?.permissions)) {
      perms.add(permission);
    }
  }
  return perms;
}

export function hasAnyPermissionFromSet(
  permissions: Set<string> | null,
  anyOf: string[],
  options?: { manageProjectOverrides?: boolean },
): boolean {
  if (!permissions) return false;
  if (permissions.has(ADMIN_BYPASS)) return true;
  if (options?.manageProjectOverrides !== false && permissions.has(MANAGE_PROJECT_PERMISSION)) return true;
  return anyOf.some((key) => permissions.has(key));
}

export async function hasAnyProjectPermission(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  projectId: string,
  anyOf: string[],
  options?: { manageProjectOverrides?: boolean },
): Promise<boolean> {
  const permissions = await getUserProjectPermissionSet(userId, isAdmin, projectId);
  return hasAnyPermissionFromSet(permissions, anyOf, options);
}

export async function userHasProjectRoleName(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  projectId: string,
  roleName: string,
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  const roles = await getProjectMemberRoles(userId, projectId);
  return roles.some((memberRole) => (memberRole.role?.name ?? '') === roleName);
}

export async function userCanManageProject(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string; createdByUserId?: string | null },
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  if (project.createdByUserId === userId) return true;

  const hasManagePermission = await hasAnyProjectPermission(
    userId,
    isAdmin,
    project.id,
    [MANAGE_PROJECT_PERMISSION],
    { manageProjectOverrides: false },
  );
  if (hasManagePermission) return true;
  return userHasProjectRoleName(userId, isAdmin, project.id, '管理者');
}

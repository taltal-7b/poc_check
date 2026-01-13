import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Role } from '../entities/Role';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get all roles
export const getAllRoles = catchAsync(async (req: AuthRequest, res: Response) => {
  const roleRepository = AppDataSource.getRepository(Role);
  const roles = await roleRepository.find({
    order: { position: 'ASC' },
  });

  res.json({
    status: 'success',
    data: { roles },
  });
});

// Get role by ID
export const getRoleById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const roleRepository = AppDataSource.getRepository(Role);
  const role = await roleRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['workflowRules', 'customFields'],
  });

  if (!role) {
    throw new AppError('ロールが見つかりません', 404);
  }

  // Parse permissions
  const permissions = role.getPermissions();

  res.json({
    status: 'success',
    data: {
      role: {
        ...role,
        permissions,
      },
    },
  });
});

// Create role (admin only)
export const createRole = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    name,
    permissions = [],
    assignable = true,
    issuesVisibility = 'default',
    usersVisibility = 'all',
    timeEntriesVisibility = 'all',
  } = req.body;

  if (!name) {
    throw new AppError('ロール名は必須です', 400);
  }

  const roleRepository = AppDataSource.getRepository(Role);

  // Get max position
  const maxPosition = await roleRepository
    .createQueryBuilder('role')
    .select('MAX(role.position)', 'max')
    .getRawOne();

  const role = roleRepository.create({
    name,
    position: (maxPosition?.max || 0) + 1,
    assignable,
    issuesVisibility,
    usersVisibility,
    timeEntriesVisibility,
    builtin: 0,
  });

  role.setPermissions(permissions);
  await roleRepository.save(role);

  res.status(201).json({
    status: 'success',
    message: 'ロールを作成しました',
    data: { role },
  });
});

// Update role (admin only)
export const updateRole = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    name,
    permissions,
    assignable,
    issuesVisibility,
    usersVisibility,
    timeEntriesVisibility,
  } = req.body;

  const roleRepository = AppDataSource.getRepository(Role);
  const role = await roleRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!role) {
    throw new AppError('ロールが見つかりません', 404);
  }

  // Cannot modify built-in roles
  if (role.builtin > 0) {
    throw new AppError('組み込みロールは変更できません', 400);
  }

  // Update fields
  if (name !== undefined) role.name = name;
  if (assignable !== undefined) role.assignable = assignable;
  if (issuesVisibility !== undefined) role.issuesVisibility = issuesVisibility;
  if (usersVisibility !== undefined) role.usersVisibility = usersVisibility;
  if (timeEntriesVisibility !== undefined) role.timeEntriesVisibility = timeEntriesVisibility;

  if (permissions !== undefined) {
    role.setPermissions(permissions);
  }

  await roleRepository.save(role);

  res.json({
    status: 'success',
    message: 'ロールを更新しました',
    data: { role },
  });
});

// Delete role (admin only)
export const deleteRole = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const roleRepository = AppDataSource.getRepository(Role);
  const role = await roleRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!role) {
    throw new AppError('ロールが見つかりません', 404);
  }

  // Cannot delete built-in roles
  if (role.builtin > 0) {
    throw new AppError('組み込みロールは削除できません', 400);
  }

  await roleRepository.remove(role);

  res.json({
    status: 'success',
    message: 'ロールを削除しました',
  });
});

// Get role permissions
export const getRolePermissions = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const roleRepository = AppDataSource.getRepository(Role);
  const role = await roleRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!role) {
    throw new AppError('ロールが見つかりません', 404);
  }

  const permissions = role.getPermissions();

  res.json({
    status: 'success',
    data: { permissions },
  });
});

// Update role permissions (admin only)
export const updateRolePermissions = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { permissions } = req.body;

  if (!Array.isArray(permissions)) {
    throw new AppError('権限は配列である必要があります', 400);
  }

  const roleRepository = AppDataSource.getRepository(Role);
  const role = await roleRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!role) {
    throw new AppError('ロールが見つかりません', 404);
  }

  if (role.builtin > 0) {
    throw new AppError('組み込みロールの権限は変更できません', 400);
  }

  role.setPermissions(permissions);
  await roleRepository.save(role);

  res.json({
    status: 'success',
    message: '権限を更新しました',
    data: {
      role: {
        id: role.id,
        name: role.name,
        permissions: role.getPermissions(),
      },
    },
  });
});

// Get available permissions list
export const getAvailablePermissions = catchAsync(async (req: AuthRequest, res: Response) => {
  // This would be loaded from the permission definitions in the spec
  const permissions = [
    // Project permissions
    { name: 'view_project', module: null, description: 'プロジェクトの閲覧' },
    { name: 'add_project', module: null, description: 'プロジェクトの作成' },
    { name: 'edit_project', module: null, description: 'プロジェクトの編集' },
    { name: 'close_project', module: null, description: 'プロジェクトのクローズ' },
    { name: 'delete_project', module: null, description: 'プロジェクトの削除' },
    { name: 'select_project_modules', module: null, description: 'モジュールの選択' },
    { name: 'manage_members', module: null, description: 'メンバーの管理' },
    { name: 'manage_versions', module: null, description: 'バージョンの管理' },
    
    // Issue permissions
    { name: 'view_issues', module: 'issue_tracking', description: '課題の閲覧' },
    { name: 'add_issues', module: 'issue_tracking', description: '課題の作成' },
    { name: 'edit_issues', module: 'issue_tracking', description: '課題の編集' },
    { name: 'edit_own_issues', module: 'issue_tracking', description: '自分の課題の編集' },
    { name: 'copy_issues', module: 'issue_tracking', description: '課題のコピー' },
    { name: 'manage_issue_relations', module: 'issue_tracking', description: '関連の管理' },
    { name: 'manage_subtasks', module: 'issue_tracking', description: 'サブタスクの管理' },
    { name: 'set_issues_private', module: 'issue_tracking', description: '課題をプライベートに設定' },
    { name: 'set_own_issues_private', module: 'issue_tracking', description: '自分の課題をプライベートに設定' },
    { name: 'add_issue_notes', module: 'issue_tracking', description: '注記の追加' },
    { name: 'edit_issue_notes', module: 'issue_tracking', description: '注記の編集' },
    { name: 'edit_own_issue_notes', module: 'issue_tracking', description: '自分の注記の編集' },
    { name: 'view_private_notes', module: 'issue_tracking', description: 'プライベート注記の閲覧' },
    { name: 'set_notes_private', module: 'issue_tracking', description: '注記をプライベートに設定' },
    { name: 'delete_issues', module: 'issue_tracking', description: '課題の削除' },
    { name: 'manage_categories', module: 'issue_tracking', description: 'カテゴリの管理' },
    { name: 'view_issue_watchers', module: 'issue_tracking', description: 'ウォッチャーの閲覧' },
    { name: 'add_issue_watchers', module: 'issue_tracking', description: 'ウォッチャーの追加' },
    { name: 'delete_issue_watchers', module: 'issue_tracking', description: 'ウォッチャーの削除' },
    { name: 'import_issues', module: 'issue_tracking', description: '課題のインポート' },
    
    // Time tracking permissions
    { name: 'log_time', module: 'time_tracking', description: '作業時間の記録' },
    { name: 'view_time_entries', module: 'time_tracking', description: '作業時間の閲覧' },
    { name: 'edit_time_entries', module: 'time_tracking', description: '作業時間の編集' },
    { name: 'edit_own_time_entries', module: 'time_tracking', description: '自分の作業時間の編集' },
    { name: 'manage_project_activities', module: 'time_tracking', description: '作業分類の管理' },
    { name: 'log_time_for_other_users', module: 'time_tracking', description: '他ユーザーの作業時間記録' },
    { name: 'import_time_entries', module: 'time_tracking', description: '作業時間のインポート' },
    
    // Other module permissions
    { name: 'view_wiki_pages', module: 'wiki', description: 'Wikiの閲覧' },
    { name: 'view_wiki_edits', module: 'wiki', description: 'Wiki履歴の閲覧' },
    { name: 'edit_wiki_pages', module: 'wiki', description: 'Wikiの編集' },
    { name: 'delete_wiki_pages', module: 'wiki', description: 'Wikiの削除' },
    { name: 'view_messages', module: 'boards', description: 'フォーラムの閲覧' },
    { name: 'add_messages', module: 'boards', description: 'メッセージの投稿' },
    { name: 'edit_messages', module: 'boards', description: 'メッセージの編集' },
    { name: 'edit_own_messages', module: 'boards', description: '自分のメッセージの編集' },
    { name: 'delete_messages', module: 'boards', description: 'メッセージの削除' },
    { name: 'delete_own_messages', module: 'boards', description: '自分のメッセージの削除' },
    { name: 'view_documents', module: 'documents', description: '文書の閲覧' },
    { name: 'add_documents', module: 'documents', description: '文書の追加' },
    { name: 'edit_documents', module: 'documents', description: '文書の編集' },
    { name: 'delete_documents', module: 'documents', description: '文書の削除' },
    { name: 'view_files', module: 'files', description: 'ファイルの閲覧' },
    { name: 'manage_files', module: 'files', description: 'ファイルの管理' },
    { name: 'browse_repository', module: 'repository', description: 'リポジトリの参照' },
    { name: 'view_changesets', module: 'repository', description: '変更履歴の閲覧' },
    { name: 'commit_access', module: 'repository', description: 'コミット権限' },
    { name: 'manage_repository', module: 'repository', description: 'リポジトリの管理' },
    { name: 'manage_related_issues', module: 'repository', description: '関連課題の管理' },
    { name: 'view_calendar', module: 'calendar', description: 'カレンダーの閲覧' },
    { name: 'view_gantt', module: 'gantt', description: 'ガントチャートの閲覧' },
  ];

  res.json({
    status: 'success',
    data: { permissions },
  });
});

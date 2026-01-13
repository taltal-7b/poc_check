import { AppDataSource } from '../config/database';
import { User, UserStatus } from '../entities/User';
import { Role } from '../entities/Role';
import { IssueStatus } from '../entities/IssueStatus';
import { IssuePriority } from '../entities/IssuePriority';
import { Tracker } from '../entities/Tracker';
import { TimeEntryActivity } from '../entities/TimeEntryActivity';
import { hashPassword } from '../utils/password.util';

export async function seedInitialData() {
  console.log('Starting database seeding...');

  try {
    // 1. Create default roles
    console.log('Creating default roles...');
    const roleRepository = AppDataSource.getRepository(Role);

    const adminRole = roleRepository.create({
      name: '管理者',
      builtin: 1,
      assignable: true,
      permissions: JSON.stringify([
        'add_project',
        'edit_project',
        'close_project',
        'delete_project',
        'select_project_modules',
        'manage_members',
        'manage_versions',
        'add_subprojects',
        'manage_public_queries',
        'save_queries',
        'view_issues',
        'add_issues',
        'edit_issues',
        'copy_issues',
        'manage_issue_relations',
        'manage_subtasks',
        'set_issues_private',
        'set_own_issues_private',
        'add_issue_notes',
        'edit_issue_notes',
        'edit_own_issue_notes',
        'view_private_notes',
        'set_notes_private',
        'delete_issues',
        'manage_issue_watchers',
        'add_issue_watchers',
        'delete_issue_watchers',
        'import_issues',
        'manage_categories',
        'comment_news',
        'view_documents',
        'manage_documents',
        'view_wiki_pages',
        'view_wiki_edits',
        'edit_wiki_pages',
        'delete_wiki_pages',
        'rename_wiki_pages',
        'manage_wiki',
        'protect_wiki_pages',
        'manage_repository',
        'browse_repository',
        'view_changesets',
        'commit_access',
        'manage_related_issues',
        'manage_boards',
        'add_messages',
        'edit_messages',
        'edit_own_messages',
        'delete_messages',
        'delete_own_messages',
        'view_calendar',
        'view_gantt',
        'view_time_entries',
        'log_time',
        'edit_time_entries',
        'edit_own_time_entries',
        'manage_project_activities',
        'log_time_for_other_users',
        'manage_workflows',
        'manage_enumerations',
        'manage_users',
        'manage_groups',
        'manage_roles',
      ]),
    });

    const developerRole = roleRepository.create({
      name: '開発者',
      builtin: 0,
      assignable: true,
      permissions: JSON.stringify([
        'view_issues',
        'add_issues',
        'edit_issues',
        'copy_issues',
        'add_issue_notes',
        'edit_own_issue_notes',
        'delete_own_issue_notes',
        'manage_subtasks',
        'set_own_issues_private',
        'add_issue_watchers',
        'view_documents',
        'view_wiki_pages',
        'view_wiki_edits',
        'edit_wiki_pages',
        'browse_repository',
        'view_changesets',
        'commit_access',
        'view_calendar',
        'view_gantt',
        'view_time_entries',
        'log_time',
        'edit_own_time_entries',
      ]),
    });

    const reporterRole = roleRepository.create({
      name: '報告者',
      builtin: 0,
      assignable: true,
      permissions: JSON.stringify([
        'view_issues',
        'add_issues',
        'add_issue_notes',
        'save_queries',
        'view_documents',
        'view_wiki_pages',
        'view_calendar',
        'view_gantt',
        'view_time_entries',
      ]),
    });

    await roleRepository.save([adminRole, developerRole, reporterRole]);
    console.log('Roles created successfully');

    // 2. Create default admin user
    console.log('Creating default admin user...');
    const userRepository = AppDataSource.getRepository(User);

    const hashedPassword = await hashPassword('admin123');
    const adminUser = userRepository.create({
      login: 'admin',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      hashedPassword,
      admin: true,
      status: UserStatus.ACTIVE,
      language: 'ja',
    });

    await userRepository.save(adminUser);
    console.log('Admin user created successfully');
    console.log('Login: admin');
    console.log('Password: admin123');

    // 3. Create default issue statuses
    console.log('Creating default issue statuses...');
    const statusRepository = AppDataSource.getRepository(IssueStatus);

    const statuses = [
      { name: '新規', position: 1, isClosed: false },
      { name: '進行中', position: 2, isClosed: false },
      { name: 'レビュー中', position: 3, isClosed: false },
      { name: '完了', position: 4, isClosed: true },
      { name: '却下', position: 5, isClosed: true },
      { name: '保留', position: 6, isClosed: false },
    ];

    for (const status of statuses) {
      const issueStatus = statusRepository.create(status);
      await statusRepository.save(issueStatus);
    }
    console.log('Issue statuses created successfully');

    // 4. Create default issue priorities
    console.log('Creating default issue priorities...');
    const priorityRepository = AppDataSource.getRepository(IssuePriority);

    const priorities = [
      { name: '低', position: 1, isDefault: false },
      { name: '通常', position: 2, isDefault: true },
      { name: '高', position: 3, isDefault: false },
      { name: '緊急', position: 4, isDefault: false },
      { name: '至急', position: 5, isDefault: false },
    ];

    for (const priority of priorities) {
      const issuePriority = priorityRepository.create(priority);
      await priorityRepository.save(issuePriority);
    }
    console.log('Issue priorities created successfully');

    // 5. Create default trackers
    console.log('Creating default trackers...');
    const trackerRepository = AppDataSource.getRepository(Tracker);
    const defaultStatus = await statusRepository.findOne({
      where: { name: '新規' },
    });

    const trackers = [
      {
        name: 'バグ',
        description: 'バグや不具合の報告',
        position: 1,
        isInRoadmap: true,
        defaultStatusId: defaultStatus?.id,
      },
      {
        name: '機能',
        description: '新機能の要望や開発',
        position: 2,
        isInRoadmap: true,
        defaultStatusId: defaultStatus?.id,
      },
      {
        name: 'サポート',
        description: 'サポートやヘルプの要求',
        position: 3,
        isInRoadmap: false,
        defaultStatusId: defaultStatus?.id,
      },
      {
        name: 'タスク',
        description: '一般的なタスクや作業項目',
        position: 4,
        isInRoadmap: true,
        defaultStatusId: defaultStatus?.id,
      },
    ];

    for (const tracker of trackers) {
      const newTracker = trackerRepository.create(tracker);
      await trackerRepository.save(newTracker);
    }
    console.log('Trackers created successfully');

    // 6. Create default time entry activities
    console.log('Creating default time entry activities...');
    const activityRepository = AppDataSource.getRepository(TimeEntryActivity);

    const activities = [
      { name: '設計', position: 1, isDefault: false },
      { name: '開発', position: 2, isDefault: true },
      { name: 'テスト', position: 3, isDefault: false },
      { name: 'レビュー', position: 4, isDefault: false },
      { name: 'ドキュメント作成', position: 5, isDefault: false },
      { name: '会議', position: 6, isDefault: false },
      { name: '調査', position: 7, isDefault: false },
    ];

    for (const activity of activities) {
      const timeActivity = activityRepository.create(activity);
      await activityRepository.save(timeActivity);
    }
    console.log('Time entry activities created successfully');

    console.log('Database seeding completed successfully!');
    console.log('\n=== Default Credentials ===');
    console.log('Username: admin');
    console.log('Password: admin123');
    console.log('===========================\n');

    return {
      success: true,
      message: 'Initial data seeded successfully',
    };
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}

// Run seed if called directly
if (require.main === module) {
  AppDataSource.initialize()
    .then(async () => {
      await seedInitialData();
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

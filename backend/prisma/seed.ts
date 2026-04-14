import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('admin', 12);

  const admin = await prisma.user.upsert({
    where: { login: 'admin' },
    update: {},
    create: {
      login: 'admin',
      hashedPassword,
      firstname: '管理者',
      lastname: 'システム',
      mail: 'admin@tasknova.local',
      admin: true,
      status: 1,
      language: 'ja',
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { name: '管理者' },
    update: {},
    create: { name: '管理者', position: 1, permissions: JSON.stringify(['manage_project', 'manage_members', 'manage_versions', 'manage_categories', 'manage_wiki', 'manage_boards', 'manage_documents', 'manage_files', 'manage_news', 'manage_repository', 'add_issues', 'edit_issues', 'delete_issues', 'manage_issue_relations', 'add_issue_watchers', 'view_issues', 'view_private_notes', 'add_issue_notes', 'edit_issue_notes', 'delete_issue_notes', 'log_time', 'view_time_entries', 'edit_time_entries', 'delete_time_entries', 'view_wiki_pages', 'edit_wiki_pages', 'delete_wiki_pages', 'view_documents', 'view_files', 'view_news', 'comment_news', 'view_messages', 'add_messages', 'edit_messages', 'delete_messages', 'view_calendar', 'view_gantt']) },
  });

  const developerRole = await prisma.role.upsert({
    where: { name: '開発者' },
    update: {},
    create: { name: '開発者', position: 2, permissions: JSON.stringify(['add_issues', 'edit_issues', 'view_issues', 'add_issue_notes', 'manage_issue_relations', 'add_issue_watchers', 'log_time', 'view_time_entries', 'view_wiki_pages', 'edit_wiki_pages', 'view_documents', 'view_files', 'view_news', 'comment_news', 'view_messages', 'add_messages', 'view_calendar', 'view_gantt']) },
  });

  const reporterRole = await prisma.role.upsert({
    where: { name: '報告者' },
    update: {},
    create: { name: '報告者', position: 3, permissions: JSON.stringify(['add_issues', 'view_issues', 'add_issue_notes', 'view_time_entries', 'view_wiki_pages', 'view_documents', 'view_files', 'view_news', 'view_messages', 'view_calendar', 'view_gantt']) },
  });

  // Delete Non member and Anonymous roles if they exist
  await prisma.role.deleteMany({ where: { name: { in: ['Non member', 'Anonymous'] } } });

  const statusNew = await prisma.issueStatus.upsert({ where: { name: '新規' }, update: {}, create: { name: '新規', position: 1 } });
  const statusInProgress = await prisma.issueStatus.upsert({ where: { name: '進行中' }, update: {}, create: { name: '進行中', position: 2 } });
  await prisma.issueStatus.upsert({ where: { name: '完了' }, update: {}, create: { name: '完了', isClosed: true, position: 3 } });
  await prisma.issueStatus.upsert({ where: { name: 'フィードバック' }, update: {}, create: { name: 'フィードバック', position: 4 } });

  const trackerBug = await prisma.tracker.upsert({ where: { name: 'バグ' }, update: {}, create: { name: 'バグ', position: 1, defaultStatusId: statusNew.id } });
  const trackerFeature = await prisma.tracker.upsert({ where: { name: '機能' }, update: {}, create: { name: '機能', position: 2, defaultStatusId: statusNew.id } });
  const trackerSupport = await prisma.tracker.upsert({ where: { name: 'サポート' }, update: {}, create: { name: 'サポート', position: 3, defaultStatusId: statusNew.id } });

  const priorities = [
    { type: 'IssuePriority', name: '低め', position: 1 },
    { type: 'IssuePriority', name: '通常', position: 2, isDefault: true },
    { type: 'IssuePriority', name: '高め', position: 3 },
    { type: 'IssuePriority', name: '急いで', position: 4 },
    { type: 'IssuePriority', name: '今すぐ', position: 5 },
  ];
  for (const p of priorities) {
    await prisma.enumeration.upsert({
      where: { id: `priority-${p.position}` },
      update: {},
      create: { id: `priority-${p.position}`, ...p },
    });
  }

  const docCategories = [
    { type: 'DocumentCategory', name: 'ユーザー文書', position: 1 },
    { type: 'DocumentCategory', name: '技術文書', position: 2 },
  ];
  for (const c of docCategories) {
    await prisma.enumeration.upsert({
      where: { id: `doccat-${c.position}` },
      update: {},
      create: { id: `doccat-${c.position}`, ...c },
    });
  }

  const activities = [
    { type: 'TimeEntryActivity', name: '設計', position: 1 },
    { type: 'TimeEntryActivity', name: '開発', position: 2, isDefault: true },
    { type: 'TimeEntryActivity', name: 'テスト', position: 3 },
    { type: 'TimeEntryActivity', name: 'ドキュメント', position: 4 },
  ];
  for (const a of activities) {
    await prisma.enumeration.upsert({
      where: { id: `activity-${a.position}` },
      update: {},
      create: { id: `activity-${a.position}`, ...a },
    });
  }

  const defaultSettings = [
    { name: 'app_title', value: 'TaskNova' },
    { name: 'default_language', value: 'ja' },
    { name: 'text_formatting', value: 'markdown' },
    { name: 'self_registration', value: '0' },
    { name: 'default_notification_option', value: 'only_assigned' },
    { name: 'per_page_options', value: '25,50,100' },
    { name: 'wiki_tablesort_enabled', value: '1' },
  ];
  for (const s of defaultSettings) {
    await prisma.setting.upsert({
      where: { name: s.name },
      update: {},
      create: s,
    });
  }

  console.log('Seed completed successfully');
  console.log(`Admin user: login=admin, password=admin`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

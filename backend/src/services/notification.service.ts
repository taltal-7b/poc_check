import { AppDataSource } from '../config/database';
import { Issue } from '../entities/Issue';
import { Journal } from '../entities/Journal';
import { Watcher } from '../entities/Watcher';
import { Member } from '../entities/Member';
import { User } from '../entities/User';
import { Project } from '../entities/Project';
import { sendEmail } from '../utils/email.util';
import { In } from 'typeorm';

// Notification types
export enum NotificationType {
  ISSUE_CREATED = 'issue_created',
  ISSUE_UPDATED = 'issue_updated',
  ISSUE_COMMENTED = 'issue_commented',
  ISSUE_ASSIGNED = 'issue_assigned',
  ISSUE_STATUS_CHANGED = 'issue_status_changed',
}

// Get recipients for issue notifications
async function getNotificationRecipients(
  issue: Issue,
  excludeUserId?: number
): Promise<User[]> {
  console.log(`[Notification] getNotificationRecipients called for issue #${issue.id}, projectId: ${issue.projectId}, excludeUserId: ${excludeUserId}`);
  const recipients: User[] = [];
  const userIds = new Set<number>();

  // 1. Watchers
  const watcherRepository = AppDataSource.getRepository(Watcher);
  const watchers = await watcherRepository.find({
    where: {
      watchableId: issue.id,
      watchableType: 'Issue',
    },
    relations: ['user'],
  });

  watchers.forEach((watcher) => {
    if (watcher.userId && watcher.userId !== excludeUserId) {
      userIds.add(watcher.userId);
      if (watcher.user) {
        recipients.push(watcher.user);
      }
    }
  });

  // 2. Author (only if mail notification is enabled for project member)
  // 3. Assigned user (only if mail notification is enabled for project member)
  // 4. Project members with mail notification enabled
  const memberRepository = AppDataSource.getRepository(Member);
  const members = await memberRepository.find({
    where: {
      projectId: issue.projectId,
      mailNotification: true,
    },
    relations: ['user'],
  });
  console.log(`[Notification] Found ${members.length} project members with mail notification enabled`);

  members.forEach((member) => {
    console.log(`[Notification] Processing member: userId=${member.userId}, hasUser=${!!member.user}, userEmail=${member.user?.email || 'N/A'}, excludeUserId=${excludeUserId}`);
    if (member.userId && member.userId !== excludeUserId && !userIds.has(member.userId)) {
      userIds.add(member.userId);
      if (member.user) {
        recipients.push(member.user);
        console.log(`[Notification] Added member to recipients: ${member.user.email}`);
      } else {
        console.log(`[Notification] Member ${member.userId} has no user relation loaded`);
      }
    } else {
      if (member.userId === excludeUserId) {
        console.log(`[Notification] Skipping member ${member.userId} (same as excludeUserId)`);
      }
      if (userIds.has(member.userId)) {
        console.log(`[Notification] Skipping member ${member.userId} (already in userIds)`);
      }
    }
  });
  
  console.log(`[Notification] Recipients before email filter: ${recipients.length}, userIds: ${userIds.size}`);

  // Also add author if they are a project member with mail notification enabled
  if (issue.authorId && issue.authorId !== excludeUserId) {
    const authorMember = members.find((m) => m.userId === issue.authorId);
    if (authorMember && !recipients.find((u) => u.id === issue.authorId)) {
      if (issue.author) {
        recipients.push(issue.author);
      } else {
        userIds.add(issue.authorId);
      }
    }
  }

  // Also add assigned user if they are a project member with mail notification enabled
  if (issue.assignedToId && issue.assignedToId !== excludeUserId) {
    const assignedMember = members.find((m) => m.userId === issue.assignedToId);
    if (assignedMember && !recipients.find((u) => u.id === issue.assignedToId)) {
      if (issue.assignedTo) {
        recipients.push(issue.assignedTo);
      } else {
        userIds.add(issue.assignedToId);
      }
    }
  }

  // Load full user data if needed
  if (userIds.size > 0) {
    const userRepository = AppDataSource.getRepository(User);
    const users = await userRepository.find({
      where: {
        id: In(Array.from(userIds)),
      },
    });

    // Add users that weren't already in recipients
    users.forEach((user) => {
      if (!recipients.find((u) => u.id === user.id)) {
        recipients.push(user);
      }
    });
  }

  // Filter out users without email
  const finalRecipients = recipients.filter((user) => user.email && user.email.trim() !== '');
  console.log(`[Notification] Final recipients after email filter: ${finalRecipients.length}, emails: ${finalRecipients.map(u => u.email).join(', ')}`);
  return finalRecipients;
}

// Format issue URL (assuming frontend URL from env or default)
function getIssueUrl(issueId: number): string {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${baseUrl}/issues/${issueId}`;
}

// Format project URL
function getProjectUrl(projectId: number): string {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${baseUrl}/projects/${projectId}`;
}

// Generate email HTML for issue created
function generateIssueCreatedEmail(issue: Issue, project: Project): string {
  const issueUrl = getIssueUrl(issue.id);
  const projectUrl = getProjectUrl(project.id);
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #3b82f6; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 20px; border-radius: 0 0 5px 5px; }
        .button { display: inline-block; padding: 10px 20px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>新しい課題が作成されました</h2>
        </div>
        <div class="content">
          <p><strong>プロジェクト:</strong> <a href="${projectUrl}">${project.name}</a></p>
          <p><strong>課題 #${issue.id}:</strong> ${issue.subject}</p>
          ${issue.description ? `<p><strong>説明:</strong><br>${issue.description.replace(/\n/g, '<br>')}</p>` : ''}
          ${issue.assignedTo ? `<p><strong>担当者:</strong> ${issue.assignedTo.lastName} ${issue.assignedTo.firstName}</p>` : ''}
          ${issue.status ? `<p><strong>ステータス:</strong> ${issue.status.name}</p>` : ''}
          ${issue.priority ? `<p><strong>優先度:</strong> ${issue.priority.name}</p>` : ''}
          ${issue.dueDate ? `<p><strong>期日:</strong> ${new Date(issue.dueDate).toLocaleDateString('ja-JP')}</p>` : ''}
          <a href="${issueUrl}" class="button">課題を表示</a>
        </div>
        <div class="footer">
          <p>このメールは自動送信されています。通知設定を変更するには、プロジェクトの設定ページをご確認ください。</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate email HTML for issue updated
function generateIssueUpdatedEmail(issue: Issue, project: Project, journal: Journal): string {
  const issueUrl = getIssueUrl(issue.id);
  const projectUrl = getProjectUrl(project.id);
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #3b82f6; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 20px; border-radius: 0 0 5px 5px; }
        .button { display: inline-block; padding: 10px 20px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>課題が更新されました</h2>
        </div>
        <div class="content">
          <p><strong>プロジェクト:</strong> <a href="${projectUrl}">${project.name}</a></p>
          <p><strong>課題 #${issue.id}:</strong> <a href="${issueUrl}">${issue.subject}</a></p>
          ${journal.user ? `<p><strong>更新者:</strong> ${journal.user.lastName} ${journal.user.firstName}</p>` : ''}
          ${journal.notes ? `<p><strong>コメント:</strong><br>${journal.notes.replace(/\n/g, '<br>')}</p>` : ''}
          <a href="${issueUrl}" class="button">課題を表示</a>
        </div>
        <div class="footer">
          <p>このメールは自動送信されています。通知設定を変更するには、プロジェクトの設定ページをご確認ください。</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate email HTML for issue commented
function generateIssueCommentedEmail(issue: Issue, project: Project, journal: Journal): string {
  const issueUrl = getIssueUrl(issue.id);
  const projectUrl = getProjectUrl(project.id);
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #10b981; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 20px; border-radius: 0 0 5px 5px; }
        .comment { background-color: white; padding: 15px; border-left: 4px solid #10b981; margin: 15px 0; }
        .button { display: inline-block; padding: 10px 20px; background-color: #10b981; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>課題にコメントが追加されました</h2>
        </div>
        <div class="content">
          <p><strong>プロジェクト:</strong> <a href="${projectUrl}">${project.name}</a></p>
          <p><strong>課題 #${issue.id}:</strong> <a href="${issueUrl}">${issue.subject}</a></p>
          ${journal.user ? `<p><strong>コメント投稿者:</strong> ${journal.user.lastName} ${journal.user.firstName}</p>` : ''}
          ${journal.notes ? `
            <div class="comment">
              <p><strong>コメント:</strong></p>
              <p>${journal.notes.replace(/\n/g, '<br>')}</p>
            </div>
          ` : ''}
          <a href="${issueUrl}" class="button">課題を表示</a>
        </div>
        <div class="footer">
          <p>このメールは自動送信されています。通知設定を変更するには、プロジェクトの設定ページをご確認ください。</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Send notification for issue created
export async function notifyIssueCreated(issue: Issue, project: Project): Promise<void> {
  console.log(`[Notification] notifyIssueCreated called for issue #${issue.id}, project: ${project.name}`);
  try {
    const recipients = await getNotificationRecipients(issue, issue.authorId);
    console.log(`[Notification] Found ${recipients.length} recipients for issue #${issue.id}`);
    
    if (recipients.length === 0) {
      console.log('[Notification] No recipients for issue created notification');
      return;
    }

    const emailHtml = generateIssueCreatedEmail(issue, project);
    const subject = `[${project.name}] 新しい課題 #${issue.id}: ${issue.subject}`;
    
    const emails = recipients.map((user) => user.email).filter(Boolean) as string[];
    
    await sendEmail({
      to: emails,
      subject,
      html: emailHtml,
    });

    console.log(`[Notification] Issue created notification sent to ${emails.length} recipients`);
  } catch (error) {
    console.error('[Notification] Failed to send issue created notification:', error);
  }
}

// Send notification for issue updated
export async function notifyIssueUpdated(
  issue: Issue,
  project: Project,
  journal: Journal
): Promise<void> {
  try {
    const recipients = await getNotificationRecipients(issue, journal.userId);
    
    if (recipients.length === 0) {
      console.log('[Notification] No recipients for issue updated notification');
      return;
    }

    const emailHtml = generateIssueUpdatedEmail(issue, project, journal);
    const subject = `[${project.name}] 課題 #${issue.id} が更新されました: ${issue.subject}`;
    
    const emails = recipients.map((user) => user.email).filter(Boolean) as string[];
    
    await sendEmail({
      to: emails,
      subject,
      html: emailHtml,
    });

    console.log(`[Notification] Issue updated notification sent to ${emails.length} recipients`);
  } catch (error) {
    console.error('[Notification] Failed to send issue updated notification:', error);
  }
}

// Send notification for issue commented
export async function notifyIssueCommented(
  issue: Issue,
  project: Project,
  journal: Journal
): Promise<void> {
  console.log(`[Notification] notifyIssueCommented called for issue #${issue.id}, project: ${project.name}, journal.userId: ${journal.userId}`);
  try {
    const recipients = await getNotificationRecipients(issue, journal.userId);
    console.log(`[Notification] Found ${recipients.length} recipients for issue #${issue.id} comment notification`);
    
    if (recipients.length === 0) {
      console.log('[Notification] No recipients for issue commented notification');
      return;
    }

    const emailHtml = generateIssueCommentedEmail(issue, project, journal);
    const subject = `[${project.name}] 課題 #${issue.id} にコメントが追加されました: ${issue.subject}`;
    
    const emails = recipients.map((user) => user.email).filter(Boolean) as string[];
    console.log(`[Notification] Sending email to: ${emails.join(', ')}`);
    
    const emailSent = await sendEmail({
      to: emails,
      subject,
      html: emailHtml,
    });

    if (emailSent) {
      console.log(`[Notification] Issue commented notification sent to ${emails.length} recipients`);
    } else {
      console.error(`[Notification] Failed to send issue commented notification to ${emails.length} recipients`);
    }
  } catch (error) {
    console.error('[Notification] Failed to send issue commented notification:', error);
  }
}

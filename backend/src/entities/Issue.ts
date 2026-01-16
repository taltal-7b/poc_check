import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from './Project';
import { Tracker } from './Tracker';
import { IssueStatus } from './IssueStatus';
import { User } from './User';
import { IssuePriority } from './IssuePriority';
import { IssueCategory } from './IssueCategory';
import { Version } from './Version';
import { TimeEntry } from './TimeEntry';
import { Attachment } from './Attachment';
import { IssueRelation } from './IssueRelation';
import { Changeset } from './Changeset';
import { Watcher } from './Watcher';

@Entity('issues')
@Index(['projectId'])
@Index(['authorId'])
@Index(['assignedToId'])
@Index(['statusId'])
@Index(['trackerId'])
export class Issue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'tracker_id' })
  trackerId: number;

  @Column({ name: 'status_id' })
  statusId: number;

  @Column({ name: 'priority_id' })
  priorityId: number;

  @Column({ name: 'author_id' })
  authorId: number;

  @Column({ name: 'assigned_to_id', nullable: true })
  assignedToId: number;

  @Column({ name: 'category_id', nullable: true })
  categoryId: number;

  @Column({ name: 'fixed_version_id', nullable: true })
  fixedVersionId: number;

  @Column({ length: 255 })
  subject: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: Date;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date;

  @Column({ name: 'done_ratio', type: 'integer', default: 0 })
  doneRatio: number;

  @Column({ name: 'estimated_hours', type: 'float', nullable: true })
  estimatedHours: number;

  @Column({ name: 'parent_id', nullable: true })
  parentId: number;

  @Column({ name: 'root_id', nullable: true })
  rootId: number;

  @Column({ type: 'integer', nullable: true })
  lft: number;

  @Column({ type: 'integer', nullable: true })
  rgt: number;

  @Column({ name: 'is_private', type: 'boolean', default: false })
  isPrivate: boolean;

  @Column({ name: 'closed_on', type: 'timestamp', nullable: true })
  closedOn: Date;

  @CreateDateColumn({ name: 'created_on' })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updated_on' })
  updatedOn: Date;

  // Relations
  @ManyToOne(() => Project, (project) => project.issues)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(() => Tracker, (tracker) => tracker.issues)
  tracker: Tracker;

  @ManyToOne(() => IssueStatus, (status) => status.issues)
  status: IssueStatus;

  @ManyToOne(() => User, (user) => user.createdIssues)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @ManyToOne(() => User, (user) => user.assignedIssues)
  @JoinColumn({ name: 'assigned_to_id' })
  assignedTo: User;

  @ManyToOne(() => IssuePriority, (priority) => priority.issues)
  priority: IssuePriority;

  @ManyToOne(() => IssueCategory, (category) => category.issues)
  category: IssueCategory;

  @ManyToOne(() => Version, (version) => version.fixedIssues)
  fixedVersion: Version;

  @ManyToOne(() => Issue, (issue) => issue.children)
  parent: Issue;

  @OneToMany(() => Issue, (issue) => issue.parent)
  children: Issue[];

  // Note: journals use polymorphic relation (journalized_id + journalized_type)
  // so we query them manually instead of using @OneToMany

  @OneToMany(() => TimeEntry, (timeEntry) => timeEntry.issue)
  timeEntries: TimeEntry[];

  @OneToMany(() => Attachment, (attachment) => attachment.container)
  attachments: Attachment[];

  @OneToMany(() => IssueRelation, (relation) => relation.issueFrom)
  relationsFrom: IssueRelation[];

  @OneToMany(() => IssueRelation, (relation) => relation.issueTo)
  relationsTo: IssueRelation[];

  @ManyToMany(() => Changeset, (changeset) => changeset.issues)
  changesets: Changeset[];

  @OneToMany(() => Watcher, (watcher) => watcher.watchable)
  watchers: Watcher[];

  // Helper methods
  get isClosed(): boolean {
    return this.closedOn !== null;
  }

  get totalSpentHours(): number {
    return this.timeEntries?.reduce((sum, entry) => sum + entry.hours, 0) || 0;
  }
}

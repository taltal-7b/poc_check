import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
  ManyToOne,
  Index,
} from 'typeorm';
import { Member } from './Member';
import { Issue } from './Issue';
import { Version } from './Version';
import { TimeEntry } from './TimeEntry';
import { Document } from './Document';
import { News } from './News';
import { IssueCategory } from './IssueCategory';
import { Board } from './Board';
import { Repository } from './Repository';
import { Wiki } from './Wiki';
import { Tracker } from './Tracker';
import { EnabledModule } from './EnabledModule';
import { IssueCustomField } from './IssueCustomField';

export enum ProjectStatus {
  ACTIVE = 1,
  CLOSED = 5,
  ARCHIVED = 9,
}

@Entity('projects')
@Index(['identifier'], { unique: true })
export class Project {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 255 })
  identifier: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'is_public', type: 'boolean', default: true })
  isPublic: boolean;

  @Column({ name: 'parent_id', nullable: true })
  parentId: number;

  @Column({ type: 'smallint', default: ProjectStatus.ACTIVE })
  status: ProjectStatus;

  @Column({ name: 'inherit_members', type: 'boolean', default: false })
  inheritMembers: boolean;

  @Column({ name: 'default_version_id', nullable: true })
  defaultVersionId: number;

  @Column({ name: 'default_assigned_to_id', nullable: true })
  defaultAssignedToId: number;

  @CreateDateColumn({ name: 'created_on' })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updated_on' })
  updatedOn: Date;

  // Relations
  @ManyToOne(() => Project, (project) => project.children)
  parent: Project;

  @OneToMany(() => Project, (project) => project.parent)
  children: Project[];

  @OneToMany(() => Member, (member) => member.project)
  members: Member[];

  @OneToMany(() => EnabledModule, (module) => module.project)
  enabledModules: EnabledModule[];

  @ManyToMany(() => Tracker, (tracker) => tracker.projects)
  @JoinTable({
    name: 'projects_trackers',
    joinColumn: { name: 'project_id' },
    inverseJoinColumn: { name: 'tracker_id' },
  })
  trackers: Tracker[];

  @OneToMany(() => Issue, (issue) => issue.project)
  issues: Issue[];

  @OneToMany(() => Version, (version) => version.project)
  versions: Version[];

  @ManyToOne(() => Version)
  defaultVersion: Version;

  @OneToMany(() => TimeEntry, (timeEntry) => timeEntry.project)
  timeEntries: TimeEntry[];

  @OneToMany(() => Document, (document) => document.project)
  documents: Document[];

  @OneToMany(() => News, (news) => news.project)
  news: News[];

  @OneToMany(() => IssueCategory, (category) => category.project)
  issueCategories: IssueCategory[];

  @OneToMany(() => Board, (board) => board.project)
  boards: Board[];

  @OneToMany(() => Repository, (repository) => repository.project)
  repositories: Repository[];

  @OneToMany(() => Wiki, (wiki) => wiki.project)
  wikis: Wiki[];

  @ManyToMany(() => IssueCustomField, (cf) => cf.projects)
  issueCustomFields: IssueCustomField[];

  // Helper methods
  get isActive(): boolean {
    return this.status === ProjectStatus.ACTIVE;
  }

  get isClosed(): boolean {
    return this.status === ProjectStatus.CLOSED;
  }

  get isArchived(): boolean {
    return this.status === ProjectStatus.ARCHIVED;
  }
}

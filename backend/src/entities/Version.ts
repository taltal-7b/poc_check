import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Project } from './Project';
import { Issue } from './Issue';

export enum VersionStatus {
  OPEN = 'open',
  LOCKED = 'locked',
  CLOSED = 'closed',
}

export enum VersionSharing {
  NONE = 'none',
  DESCENDANTS = 'descendants',
  HIERARCHY = 'hierarchy',
  TREE = 'tree',
  SYSTEM = 'system',
}

@Entity('versions')
export class Version {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'effective_date', type: 'date', nullable: true })
  effectiveDate: Date;

  @Column({ type: 'varchar', length: 30, default: VersionStatus.OPEN })
  status: VersionStatus;

  @Column({ type: 'varchar', length: 30, default: VersionSharing.NONE })
  sharing: VersionSharing;

  @Column({ name: 'wiki_page_title', length: 255, nullable: true })
  wikiPageTitle: string;

  @CreateDateColumn({ name: 'created_on' })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updated_on' })
  updatedOn: Date;

  // Relations
  @ManyToOne(() => Project, (project) => project.versions)
  project: Project;

  @OneToMany(() => Issue, (issue) => issue.fixedVersion)
  fixedIssues: Issue[];

  // Helper methods
  get isOpen(): boolean {
    return this.status === VersionStatus.OPEN;
  }

  get isClosed(): boolean {
    return this.status === VersionStatus.CLOSED;
  }

  get isLocked(): boolean {
    return this.status === VersionStatus.LOCKED;
  }
}

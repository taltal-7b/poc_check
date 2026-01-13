import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Project } from './Project';
import { Issue } from './Issue';
import { User } from './User';
import { TimeEntryActivity } from './TimeEntryActivity';

@Entity('time_entries')
@Index(['projectId'])
@Index(['issueId'])
@Index(['userId'])
export class TimeEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'issue_id', nullable: true })
  issueId: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'activity_id' })
  activityId: number;

  @Column({ type: 'float' })
  hours: number;

  @Column({ type: 'text', nullable: true })
  comments: string;

  @Column({ name: 'spent_on', type: 'date' })
  spentOn: Date;

  @Column({ name: 'tyear', type: 'integer' })
  tyear: number;

  @Column({ name: 'tmonth', type: 'integer' })
  tmonth: number;

  @Column({ name: 'tweek', type: 'integer' })
  tweek: number;

  @CreateDateColumn({ name: 'created_on' })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updated_on' })
  updatedOn: Date;

  // Relations
  @ManyToOne(() => Project, (project) => project.timeEntries)
  project: Project;

  @ManyToOne(() => Issue, (issue) => issue.timeEntries)
  issue: Issue;

  @ManyToOne(() => User, (user) => user.timeEntries)
  user: User;

  @ManyToOne(() => TimeEntryActivity, (activity) => activity.timeEntries)
  activity: TimeEntryActivity;
}

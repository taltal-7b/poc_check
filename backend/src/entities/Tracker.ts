import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  OneToMany,
  ManyToOne,
} from 'typeorm';
import { Project } from './Project';
import { Issue } from './Issue';
import { WorkflowRule } from './WorkflowRule';
import { IssueStatus } from './IssueStatus';
import { IssueCustomField } from './IssueCustomField';

@Entity('trackers')
export class Tracker {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'is_in_roadmap', type: 'boolean', default: true })
  isInRoadmap: boolean;

  @Column({ type: 'integer', nullable: true })
  position: number;

  @Column({ name: 'default_status_id', nullable: true })
  defaultStatusId: number;

  @Column({ name: 'fields_bits', type: 'integer', default: 0 })
  fieldsBits: number;

  // Relations
  @ManyToMany(() => Project, (project) => project.trackers)
  projects: Project[];

  @OneToMany(() => Issue, (issue) => issue.tracker)
  issues: Issue[];

  @OneToMany(() => WorkflowRule, (workflow) => workflow.tracker)
  workflowRules: WorkflowRule[];

  @ManyToOne(() => IssueStatus)
  defaultStatus: IssueStatus;

  @ManyToMany(() => IssueCustomField, (cf) => cf.trackers)
  issueCustomFields: IssueCustomField[];
}

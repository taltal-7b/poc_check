import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { Issue } from './Issue';
import { WorkflowRule } from './WorkflowRule';

@Entity('issue_statuses')
export class IssueStatus {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'is_closed', type: 'boolean', default: false })
  isClosed: boolean;

  @Column({ type: 'integer', nullable: true })
  position: number;

  @Column({ name: 'default_done_ratio', type: 'integer', nullable: true })
  defaultDoneRatio: number;

  // Relations
  @OneToMany(() => Issue, (issue) => issue.status)
  issues: Issue[];

  @OneToMany(() => WorkflowRule, (workflow) => workflow.oldStatus)
  workflowsAsOldStatus: WorkflowRule[];

  @OneToMany(() => WorkflowRule, (workflow) => workflow.newStatus)
  workflowsAsNewStatus: WorkflowRule[];
}

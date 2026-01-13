import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { Role } from './Role';
import { Tracker } from './Tracker';
import { IssueStatus } from './IssueStatus';

@Entity('workflow_rules')
@Index(['roleId', 'trackerId', 'oldStatusId'])
export class WorkflowRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tracker_id' })
  trackerId: number;

  @Column({ name: 'old_status_id' })
  oldStatusId: number;

  @Column({ name: 'new_status_id' })
  newStatusId: number;

  @Column({ name: 'role_id' })
  roleId: number;

  @Column({ type: 'boolean', default: false })
  assignee: boolean;

  @Column({ type: 'boolean', default: false })
  author: boolean;

  @Column({ type: 'varchar', length: 30, nullable: true })
  type: string;

  @Column({ name: 'field_name', length: 30, nullable: true })
  fieldName: string;

  @Column({ length: 30, nullable: true })
  rule: string;

  // Relations
  @ManyToOne(() => Role, (role) => role.workflowRules)
  role: Role;

  @ManyToOne(() => Tracker, (tracker) => tracker.workflowRules)
  tracker: Tracker;

  @ManyToOne(() => IssueStatus, (status) => status.workflowsAsOldStatus)
  oldStatus: IssueStatus;

  @ManyToOne(() => IssueStatus, (status) => status.workflowsAsNewStatus)
  newStatus: IssueStatus;
}

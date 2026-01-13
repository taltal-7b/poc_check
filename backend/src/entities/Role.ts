import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  OneToMany,
  JoinTable,
} from 'typeorm';
import { MemberRole } from './MemberRole';
import { CustomField } from './CustomField';
import { WorkflowRule } from './WorkflowRule';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'integer', nullable: true })
  position: number;

  @Column({ type: 'boolean', default: true })
  assignable: boolean;

  @Column({ type: 'smallint', default: 0 })
  builtin: number;

  @Column({ type: 'text', nullable: true })
  permissions: string; // Serialized permissions array

  @Column({ name: 'issues_visibility', length: 30, default: 'default' })
  issuesVisibility: string;

  @Column({ name: 'users_visibility', length: 30, default: 'all' })
  usersVisibility: string;

  @Column({ name: 'time_entries_visibility', length: 30, default: 'all' })
  timeEntriesVisibility: string;

  @Column({ name: 'all_roles_managed', type: 'boolean', default: true })
  allRolesManaged: boolean;

  @Column({ type: 'text', nullable: true })
  settings: string; // Serialized settings

  // Relations
  @OneToMany(() => MemberRole, (memberRole) => memberRole.role)
  memberRoles: MemberRole[];

  @ManyToMany(() => CustomField, (customField) => customField.roles)
  customFields: CustomField[];

  @ManyToMany(() => Role)
  @JoinTable({
    name: 'roles_managed_roles',
    joinColumn: { name: 'role_id' },
    inverseJoinColumn: { name: 'managed_role_id' },
  })
  managedRoles: Role[];

  @OneToMany(() => WorkflowRule, (workflow) => workflow.role)
  workflowRules: WorkflowRule[];

  // Helper methods
  getPermissions(): string[] {
    try {
      return this.permissions ? JSON.parse(this.permissions) : [];
    } catch {
      return [];
    }
  }

  setPermissions(permissions: string[]): void {
    this.permissions = JSON.stringify(permissions);
  }

  hasPermission(permission: string): boolean {
    return this.getPermissions().includes(permission);
  }
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
} from 'typeorm';
import { Member } from './Member';
import { Role } from './Role';

@Entity('member_roles')
export class MemberRole {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'member_id' })
  memberId: number;

  @Column({ name: 'role_id' })
  roleId: number;

  @Column({ name: 'inherited_from', nullable: true })
  inheritedFrom: number;

  // Relations
  @ManyToOne(() => Member, (member) => member.memberRoles)
  member: Member;

  @ManyToOne(() => Role, (role) => role.memberRoles)
  role: Role;
}

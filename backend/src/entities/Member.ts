import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
  JoinColumn,
} from 'typeorm';
import { User } from './User';
import { Project } from './Project';
import { MemberRole } from './MemberRole';

@Entity('members')
@Index(['userId', 'projectId'], { unique: true })
export class Member {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'mail_notification', type: 'boolean', default: false })
  mailNotification: boolean;

  @CreateDateColumn({ name: 'created_on' })
  createdOn: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.members, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Project, (project) => project.members, { eager: false })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @OneToMany(() => MemberRole, (memberRole) => memberRole.member)
  memberRoles: MemberRole[];
}

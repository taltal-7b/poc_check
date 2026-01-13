import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { Issue } from './Issue';

@Entity('issue_priorities')
export class IssuePriority {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'integer', nullable: true })
  position: number;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'position_name', length: 30, nullable: true })
  positionName: string;

  // Relations
  @OneToMany(() => Issue, (issue) => issue.priority)
  issues: Issue[];
}

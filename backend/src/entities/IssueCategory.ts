import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Project } from './Project';
import { Issue } from './Issue';
import { User } from './User';

@Entity('issue_categories')
export class IssueCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'assigned_to_id', nullable: true })
  assignedToId: number;

  // Relations
  @ManyToOne(() => Project, (project) => project.issueCategories)
  project: Project;

  @ManyToOne(() => User)
  assignedTo: User;

  @OneToMany(() => Issue, (issue) => issue.category)
  issues: Issue[];
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Project } from './Project';
import { User } from './User';

@Entity('news')
export class News {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id', nullable: true })
  projectId: number;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'author_id' })
  authorId: number;

  @CreateDateColumn({ name: 'created_on' })
  createdOn: Date;

  @Column({ name: 'comments_count', type: 'integer', default: 0 })
  commentsCount: number;

  // Relations
  @ManyToOne(() => Project, (project) => project.news)
  project: Project;

  @ManyToOne(() => User)
  author: User;
}

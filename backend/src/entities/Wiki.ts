import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Project } from './Project';
import { WikiPage } from './WikiPage';

@Entity('wikis')
export class Wiki {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'start_page', length: 255 })
  startPage: string;

  @Column({ type: 'smallint', default: 1 })
  status: number;

  // Relations
  @ManyToOne(() => Project, (project) => project.wikis)
  project: Project;

  @OneToMany(() => WikiPage, (page) => page.wiki)
  pages: WikiPage[];
}

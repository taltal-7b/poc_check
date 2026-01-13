import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { Project } from './Project';

@Entity('enabled_modules')
@Index(['projectId', 'name'], { unique: true })
export class EnabledModule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ length: 255 })
  name: string;

  // Relations
  @ManyToOne(() => Project, (project) => project.enabledModules)
  project: Project;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Project } from './Project';
import { Changeset } from './Changeset';

@Entity('repositories')
export class Repository {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ length: 255 })
  url: string;

  @Column({ length: 255, nullable: true })
  login: string;

  @Column({ length: 255, nullable: true })
  password: string;

  @Column({ name: 'root_url', length: 255, nullable: true })
  rootUrl: string;

  @Column({ length: 30 })
  type: string;

  @Column({ name: 'path_encoding', length: 64, nullable: true })
  pathEncoding: string;

  @Column({ name: 'log_encoding', length: 64, nullable: true })
  logEncoding: string;

  @Column({ name: 'extra_info', type: 'text', nullable: true })
  extraInfo: string;

  @Column({ length: 255, nullable: true })
  identifier: string;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn({ name: 'created_on' })
  createdOn: Date;

  // Relations
  @ManyToOne(() => Project, (project) => project.repositories)
  project: Project;

  @OneToMany(() => Changeset, (changeset) => changeset.repository)
  changesets: Changeset[];
}

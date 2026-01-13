import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
  Index,
} from 'typeorm';
import { Repository } from './Repository';
import { User } from './User';
import { Issue } from './Issue';

@Entity('changesets')
@Index(['repositoryId', 'revision'], { unique: true })
export class Changeset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'repository_id' })
  repositoryId: number;

  @Column({ length: 255 })
  revision: string;

  @Column({ length: 255, nullable: true })
  committer: string;

  @Column({ name: 'committed_on', type: 'timestamp' })
  committedOn: Date;

  @Column({ type: 'text', nullable: true })
  comments: string;

  @Column({ name: 'commit_date', type: 'date', nullable: true })
  commitDate: Date;

  @Column({ length: 60, nullable: true })
  scmid: string;

  @Column({ name: 'user_id', nullable: true })
  userId: number;

  // Relations
  @ManyToOne(() => Repository, (repository) => repository.changesets)
  repository: Repository;

  @ManyToOne(() => User, (user) => user.changesets)
  user: User;

  @ManyToMany(() => Issue, (issue) => issue.changesets)
  @JoinTable({
    name: 'changesets_issues',
    joinColumn: { name: 'changeset_id' },
    inverseJoinColumn: { name: 'issue_id' },
  })
  issues: Issue[];
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { Issue } from './Issue';
import { User } from './User';
import { JournalDetail } from './JournalDetail';

@Entity('journals')
@Index(['journalizedId', 'journalizedType'])
export class Journal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'journalized_id' })
  journalizedId: number;

  @Column({ name: 'journalized_type', length: 30 })
  journalizedType: string;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_on' })
  createdOn: Date;

  @Column({ name: 'private_notes', type: 'boolean', default: false })
  privateNotes: boolean;

  // Relations
  @ManyToOne(() => Issue, (issue) => issue.journals)
  issue: Issue;

  @ManyToOne(() => User, (user) => user.journals)
  user: User;

  @OneToMany(() => JournalDetail, (detail) => detail.journal)
  details: JournalDetail[];
}

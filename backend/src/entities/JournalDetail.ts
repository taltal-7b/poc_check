import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { Journal } from './Journal';

@Entity('journal_details')
@Index(['journalId'])
export class JournalDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'journal_id' })
  journalId: number;

  @Column({ length: 30 })
  property: string;

  @Column({ name: 'prop_key', length: 255 })
  propKey: string;

  @Column({ name: 'old_value', type: 'text', nullable: true })
  oldValue: string;

  @Column({ name: 'value', type: 'text', nullable: true })
  value: string;

  // Relations
  @ManyToOne(() => Journal, (journal) => journal.details)
  journal: Journal;
}

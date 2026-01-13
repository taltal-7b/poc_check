import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { TimeEntry } from './TimeEntry';

@Entity('time_entry_activities')
export class TimeEntryActivity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'integer', nullable: true })
  position: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'parent_id', nullable: true })
  parentId: number;

  // Relations
  @OneToMany(() => TimeEntry, (timeEntry) => timeEntry.activity)
  timeEntries: TimeEntry[];
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User';

@Entity('user_preferences')
export class UserPreference {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ type: 'text', nullable: true })
  others: string; // Serialized preferences

  @Column({ name: 'hide_mail', type: 'boolean', default: true })
  hideMail: boolean;

  @Column({ name: 'time_zone', length: 255, nullable: true })
  timeZone: string;

  @Column({ name: 'no_self_notified', type: 'boolean', default: true })
  noSelfNotified: boolean;

  @Column({ name: 'comments_sorting', length: 30, default: 'asc' })
  commentsSorting: string;

  // Relations
  @OneToOne(() => User, (user) => user.preference)
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Helper methods
  getOthers(): Record<string, any> {
    try {
      return this.others ? JSON.parse(this.others) : {};
    } catch {
      return {};
    }
  }

  setOthers(preferences: Record<string, any>): void {
    this.others = JSON.stringify(preferences);
  }
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { User } from './User';

@Entity('watchers')
@Index(['watchableId', 'watchableType'])
@Index(['userId', 'watchableId', 'watchableType'], { unique: true })
export class Watcher {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'watchable_type', length: 255, default: '' })
  watchableType: string;

  @Column({ name: 'watchable_id' })
  watchableId: number;

  @Column({ name: 'user_id' })
  userId: number;

  // Relations
  @ManyToOne(() => User)
  user: User;

  // Polymorphic relation
  watchable: any;
}

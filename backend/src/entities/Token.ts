import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { User } from './User';

export enum TokenAction {
  SESSION = 'session',
  API = 'api',
  FEEDS = 'feeds',
  RECOVERY = 'recovery',
  REGISTER = 'register',
  AUTOLOGIN = 'autologin',
}

@Entity('tokens')
@Index(['value'], { unique: true })
export class Token {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ type: 'varchar', length: 40 })
  action: TokenAction;

  @Column({ type: 'varchar', length: 255 })
  value: string;

  @CreateDateColumn({ name: 'created_on' })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updated_on' })
  updatedOn: Date;

  // Relations
  @ManyToOne(() => User)
  user: User;
}

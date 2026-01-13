import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Board } from './Board';
import { User } from './User';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'board_id' })
  boardId: number;

  @Column({ name: 'parent_id', nullable: true })
  parentId: number;

  @Column({ length: 255 })
  subject: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ name: 'author_id' })
  authorId: number;

  @Column({ name: 'replies_count', type: 'integer', default: 0 })
  repliesCount: number;

  @Column({ name: 'last_reply_id', nullable: true })
  lastReplyId: number;

  @CreateDateColumn({ name: 'created_on' })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updated_on' })
  updatedOn: Date;

  @Column({ type: 'boolean', default: false })
  locked: boolean;

  @Column({ type: 'boolean', default: false })
  sticky: boolean;

  // Relations
  @ManyToOne(() => Board, (board) => board.messages)
  board: Board;

  @ManyToOne(() => User)
  author: User;

  @ManyToOne(() => Message, (message) => message.replies)
  parent: Message;

  @ManyToOne(() => Message)
  replies: Message[];
}

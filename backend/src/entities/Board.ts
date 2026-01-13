import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Project } from './Project';
import { Message } from './Message';

@Entity('boards')
export class Board {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'integer', nullable: true })
  position: number;

  @Column({ name: 'topics_count', type: 'integer', default: 0 })
  topicsCount: number;

  @Column({ name: 'messages_count', type: 'integer', default: 0 })
  messagesCount: number;

  @Column({ name: 'last_message_id', nullable: true })
  lastMessageId: number;

  // Relations
  @ManyToOne(() => Project, (project) => project.boards)
  project: Project;

  @OneToMany(() => Message, (message) => message.board)
  messages: Message[];
}

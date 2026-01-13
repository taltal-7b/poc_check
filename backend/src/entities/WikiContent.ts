import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { WikiPage } from './WikiPage';
import { User } from './User';

@Entity('wiki_contents')
export class WikiContent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'page_id' })
  pageId: number;

  @Column({ name: 'author_id', nullable: true })
  authorId: number;

  @Column({ type: 'text', nullable: true })
  text: string;

  @Column({ type: 'text', nullable: true })
  comments: string;

  @UpdateDateColumn({ name: 'updated_on' })
  updatedOn: Date;

  @Column({ type: 'integer', default: 0 })
  version: number;

  // Relations
  @OneToOne(() => WikiPage, (page) => page.content)
  @JoinColumn({ name: 'page_id' })
  page: WikiPage;

  @ManyToOne(() => User)
  author: User;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  Index,
} from 'typeorm';
import { Wiki } from './Wiki';
import { WikiContent } from './WikiContent';

@Entity('wiki_pages')
@Index(['wikiId', 'title'], { unique: true })
export class WikiPage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'wiki_id' })
  wikiId: number;

  @Column({ length: 255 })
  title: string;

  @CreateDateColumn({ name: 'created_on' })
  createdOn: Date;

  @Column({ type: 'boolean', default: false })
  protected: boolean;

  @Column({ name: 'parent_id', nullable: true })
  parentId: number;

  // Relations
  @ManyToOne(() => Wiki, (wiki) => wiki.pages)
  wiki: Wiki;

  @OneToOne(() => WikiContent, (content) => content.page)
  content: WikiContent;

  @ManyToOne(() => WikiPage, (page) => page.children)
  parent: WikiPage;

  @ManyToOne(() => WikiPage, (page) => page.parent)
  children: WikiPage[];
}

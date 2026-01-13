import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { User } from './User';

@Entity('attachments')
@Index(['containerId', 'containerType'])
export class Attachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'container_id' })
  containerId: number;

  @Column({ name: 'container_type', length: 30 })
  containerType: string;

  @Column({ length: 255 })
  filename: string;

  @Column({ name: 'disk_filename', length: 255 })
  diskFilename: string;

  @Column({ type: 'bigint', default: 0 })
  filesize: number;

  @Column({ name: 'content_type', length: 255, nullable: true })
  contentType: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  digest: string;

  @Column({ type: 'integer', default: 0 })
  downloads: number;

  @Column({ name: 'author_id' })
  authorId: number;

  @CreateDateColumn({ name: 'created_on' })
  createdOn: Date;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'disk_directory', length: 255, nullable: true })
  diskDirectory: string;

  // Relations
  @ManyToOne(() => User)
  author: User;

  // Polymorphic relation - container can be Issue, Document, etc.
  container: any;

  // Helper methods
  get isImage(): boolean {
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    return this.contentType ? imageTypes.includes(this.contentType.toLowerCase()) : false;
  }

  get sizeMB(): number {
    return Number(this.filesize) / (1024 * 1024);
  }
}

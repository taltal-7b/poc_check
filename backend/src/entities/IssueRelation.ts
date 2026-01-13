import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { Issue } from './Issue';

export enum IssueRelationType {
  RELATES = 'relates',
  DUPLICATES = 'duplicates',
  DUPLICATED = 'duplicated',
  BLOCKS = 'blocks',
  BLOCKED = 'blocked',
  PRECEDES = 'precedes',
  FOLLOWS = 'follows',
  COPIED_TO = 'copied_to',
  COPIED_FROM = 'copied_from',
}

@Entity('issue_relations')
@Index(['issueFromId'])
@Index(['issueToId'])
export class IssueRelation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'issue_from_id' })
  issueFromId: number;

  @Column({ name: 'issue_to_id' })
  issueToId: number;

  @Column({ name: 'relation_type', type: 'varchar', length: 30 })
  relationType: IssueRelationType;

  @Column({ type: 'integer', nullable: true })
  delay: number;

  // Relations
  @ManyToOne(() => Issue, (issue) => issue.relationsFrom)
  issueFrom: Issue;

  @ManyToOne(() => Issue, (issue) => issue.relationsTo)
  issueTo: Issue;
}

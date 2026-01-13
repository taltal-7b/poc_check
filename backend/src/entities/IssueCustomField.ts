import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Project } from './Project';
import { Tracker } from './Tracker';

@Entity('issue_custom_fields')
export class IssueCustomField {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 30 })
  type: string;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'field_format', length: 30 })
  fieldFormat: string;

  @Column({ name: 'possible_values', type: 'text', nullable: true })
  possibleValues: string;

  @Column({ name: 'regexp', length: 255, nullable: true })
  regexp: string;

  @Column({ name: 'min_length', type: 'integer', nullable: true })
  minLength: number;

  @Column({ name: 'max_length', type: 'integer', nullable: true })
  maxLength: number;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  isRequired: boolean;

  @Column({ name: 'is_for_all', type: 'boolean', default: false })
  isForAll: boolean;

  @Column({ name: 'is_filter', type: 'boolean', default: false })
  isFilter: boolean;

  @Column({ type: 'integer', nullable: true })
  position: number;

  @Column({ type: 'boolean', default: true })
  searchable: boolean;

  @Column({ name: 'default_value', type: 'text', nullable: true })
  defaultValue: string;

  @Column({ type: 'boolean', default: true })
  editable: boolean;

  @Column({ type: 'boolean', default: true })
  visible: boolean;

  @Column({ type: 'boolean', default: false })
  multiple: boolean;

  @Column({ name: 'format_store', type: 'text', nullable: true })
  formatStore: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  // Relations specific to issue custom fields
  @ManyToMany(() => Project, (project) => project.issueCustomFields)
  @JoinTable({
    name: 'custom_fields_projects',
    joinColumn: { name: 'custom_field_id' },
    inverseJoinColumn: { name: 'project_id' },
  })
  projects: Project[];

  @ManyToMany(() => Tracker)
  @JoinTable({
    name: 'custom_fields_trackers',
    joinColumn: { name: 'custom_field_id' },
    inverseJoinColumn: { name: 'tracker_id' },
  })
  trackers: Tracker[];
}

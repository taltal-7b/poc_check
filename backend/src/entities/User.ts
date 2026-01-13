import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  OneToMany,
  OneToOne,
  ManyToOne,
  Index,
} from 'typeorm';
import { Group } from './Group';
import { Member } from './Member';
import { Issue } from './Issue';
import { TimeEntry } from './TimeEntry';
import { Journal } from './Journal';
import { Token } from './Token';
import { EmailAddress } from './EmailAddress';
import { UserPreference } from './UserPreference';
import { Changeset } from './Changeset';
import { AuthSource } from './AuthSource';

export enum UserStatus {
  ANONYMOUS = 0,
  ACTIVE = 1,
  REGISTERED = 2,
  LOCKED = 3,
}

@Entity('users')
@Index(['login'], { unique: true })
@Index(['email'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 255 })
  login: string;

  @Column({ length: 255, nullable: true })
  email: string;

  @Column({ name: 'hashed_password', length: 255 })
  hashedPassword: string;

  @Column({ name: 'first_name', length: 255, default: '' })
  firstName: string;

  @Column({ name: 'last_name', length: 255, default: '' })
  lastName: string;

  @Column({ type: 'boolean', default: true })
  admin: boolean;

  @Column({
    type: 'smallint',
    default: UserStatus.REGISTERED,
  })
  status: UserStatus;

  @Column({ name: 'last_login_on', type: 'timestamp', nullable: true })
  lastLoginOn: Date;

  @Column({ length: 6, nullable: true })
  language: string;

  @Column({ name: 'auth_source_id', nullable: true })
  authSourceId: number;

  @CreateDateColumn({ name: 'created_on' })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updated_on' })
  updatedOn: Date;

  @Column({ name: 'must_change_passwd', type: 'boolean', default: false })
  mustChangePasswd: boolean;

  @Column({ name: 'passwd_changed_on', type: 'timestamp', nullable: true })
  passwdChangedOn: Date;

  @Column({ name: 'twofa_scheme', length: 255, nullable: true })
  twofaScheme: string;

  @Column({ name: 'twofa_secret', length: 255, nullable: true })
  twofaSecret: string;

  @Column({ name: 'twofa_backup_codes', type: 'text', nullable: true })
  twofaBackupCodes: string;

  // Relations
  @ManyToMany(() => Group, (group) => group.users)
  groups: Group[];

  @OneToMany(() => Member, (member) => member.user)
  members: Member[];

  @OneToMany(() => Issue, (issue) => issue.author)
  createdIssues: Issue[];

  @OneToMany(() => Issue, (issue) => issue.assignedTo)
  assignedIssues: Issue[];

  @OneToMany(() => TimeEntry, (timeEntry) => timeEntry.user)
  timeEntries: TimeEntry[];

  @OneToMany(() => Journal, (journal) => journal.user)
  journals: Journal[];

  @OneToMany(() => Changeset, (changeset) => changeset.user)
  changesets: Changeset[];

  @OneToOne(() => UserPreference, (preference) => preference.user)
  preference: UserPreference;

  @OneToOne(() => Token, (token) => token.user)
  atomToken: Token;

  @OneToOne(() => Token, (token) => token.user)
  apiToken: Token;

  @OneToOne(() => EmailAddress, (emailAddress) => emailAddress.user)
  primaryEmailAddress: EmailAddress;

  @OneToMany(() => EmailAddress, (emailAddress) => emailAddress.user)
  emailAddresses: EmailAddress[];

  @ManyToOne(() => AuthSource)
  authSource: AuthSource;

  // Helper methods
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  get isActive(): boolean {
    return this.status === UserStatus.ACTIVE;
  }

  get isLocked(): boolean {
    return this.status === UserStatus.LOCKED;
  }

  get isAnonymous(): boolean {
    return this.status === UserStatus.ANONYMOUS;
  }
}

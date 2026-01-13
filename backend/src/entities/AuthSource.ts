import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

@Entity('auth_sources')
export class AuthSource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 30 })
  type: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 255, nullable: true })
  host: string;

  @Column({ type: 'integer', nullable: true })
  port: number;

  @Column({ length: 255, nullable: true })
  account: string;

  @Column({ name: 'account_password', length: 255, nullable: true })
  accountPassword: string;

  @Column({ name: 'base_dn', length: 255, nullable: true })
  baseDn: string;

  @Column({ name: 'attr_login', length: 30, nullable: true })
  attrLogin: string;

  @Column({ name: 'attr_firstname', length: 30, nullable: true })
  attrFirstname: string;

  @Column({ name: 'attr_lastname', length: 30, nullable: true })
  attrLastname: string;

  @Column({ name: 'attr_mail', length: 30, nullable: true })
  attrMail: string;

  @Column({ name: 'onthefly_register', type: 'boolean', default: false })
  ontheflyRegister: boolean;

  @Column({ type: 'boolean', default: true })
  tls: boolean;

  @Column({ type: 'text', nullable: true })
  filter: string;

  @Column({ type: 'integer', nullable: true })
  timeout: number;
}

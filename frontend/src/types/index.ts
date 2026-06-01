export interface User {
  id: string;
  login: string;
  firstname: string;
  lastname: string;
  mail: string;
  admin: boolean;
  status: number;
  language: string;
  totpEnabled: boolean;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  identifier: string;
  description: string | null;
  isPublic: boolean;
  status: number;
  parentId: string | null;
  createdByUserId?: string;
  bookmarked: boolean;
  createdAt: string;
  updatedAt: string;
  enabledModules?: { name: string }[];
  projectTrackers?: { trackerId: string; tracker: Tracker }[];
  projectCustomFields?: { customFieldId: string; customField: CustomField }[];
  permissions?: {
    canCreateIssue: boolean;
    canEditIssue: boolean;
    canDeleteIssue?: boolean;
    canAddIssueNotes: boolean;
    canManageProject: boolean;
    canViewTimeEntries?: boolean;
    canLogTime?: boolean;
    canEditTimeEntries?: boolean;
    canDeleteTimeEntries?: boolean;
    canUseAiActions?: boolean;
  };
  _count?: { issues?: number; members?: number };
}

export interface ProjectAiProgressSummary {
  summary: string;
  issueCount: number;
  issueLimit: number;
  scope: 'project' | 'assigned';
}

export interface ProjectAiWeeklyReport {
  report: string;
  issueCount: number;
  issueLimit: number;
  periodStart: string;
  periodEnd: string;
}

export interface ProjectAiBottleneckDetection {
  report: string;
  overdueOpenIssueCount: number;
  lateClosedIssueCount: number;
  overdueOpenIssueLimit: number;
  lateClosedIssueLimit: number;
}

export interface ProjectAiTaskInstruction {
  instructions: string;
  issueCount: number;
  issueLimit: number;
}

export interface Tracker {
  id: string;
  name: string;
  position: number;
  defaultStatusId: string | null;
  description: string | null;
  standardFields?: TrackerStandardField[];
}

export interface TrackerStandardField {
  id?: string;
  trackerId?: string;
  fieldKey: string;
  enabled: boolean;
  required: boolean;
}

export interface IssueStatus {
  id: string;
  name: string;
  isClosed: boolean;
  position: number;
}

export interface IssueCategory {
  id: string;
  projectId: string;
  name: string;
  assigneeId: string | null;
}

export interface Issue {
  id: string;
  number: number;
  subject: string;
  description: string | null;
  projectId: string;
  trackerId: string;
  statusId: string;
  priority: number;
  authorId: string;
  assigneeId: string | null;
  assigneeGroupId: string | null;
  categoryId: string | null;
  parentId: string | null;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  spentHours?: number;
  childIssueCount?: number;
  doneRatio: number;
  closedOn: string | null;
  createdAt: string;
  updatedAt: string;
  project?: Project;
  tracker?: Tracker;
  status?: IssueStatus;
  author?: User;
  assignee?: User | null;
  assigneeGroup?: Group | null;
  category?: { id: string; name: string } | null;
  parent?: { id: string; number?: number; subject: string };
  children?: { id: string; number: number; subject: string }[];
  treeDepth?: number;
  journals?: Journal[];
  customFields?: IssueCustomFieldValue[];
}

export interface IssueCustomFieldValue {
  id: string;
  name: string;
  fieldFormat: string;
  isRequired: boolean;
  isFilter?: boolean;
  searchable?: boolean;
  multiple?: boolean;
  defaultValue?: string | null;
  possibleValues?: string[] | string | null;
  trackerIds?: string[];
  projectIds?: string[];
  value?: string | string[] | null;
}

export interface Journal {
  id: string;
  issueId: string;
  userId: string;
  notes: string | null;
  private: boolean;
  createdAt: string;
  updatedAt?: string | null;
  user?: User;
  details?: JournalDetail[];
  attachments?: Attachment[];
}

export interface JournalDetail {
  id: string;
  property: string;
  propKey: string;
  oldValue: string | null;
  newValue: string | null;
  customFieldName?: string | null;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  issueId: string | null;
  userId: string;
  activityId: string;
  hours: number;
  comments: string | null;
  spentOn: string;
  project?: Project;
  issue?: Issue;
  user?: User;
  activity?: Enumeration;
}

export interface Enumeration {
  id: string;
  type: string;
  name: string;
  position: number;
  isDefault: boolean;
  active: boolean;
}

export interface Version {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  sharing: string;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  filename: string;
  filesize: number;
  contentType: string | null;
  description: string | null;
  versionId: string | null;
  authorId: string;
  createdAt: string;
  author?: Pick<User, 'id' | 'login' | 'firstname' | 'lastname'> | null;
  version?: Pick<Version, 'id' | 'name' | 'status' | 'dueDate'> | null;
}

export interface ProjectFilesPayload {
  files: ProjectFile[];
  versions: Array<Pick<Version, 'id' | 'name' | 'status' | 'dueDate'>>;
  canManage: boolean;
}

export interface WikiPage {
  id: string;
  title: string;
  protected: boolean;
  /** バックエンドが GET /wiki/:title で付与。保護の切替が可能なユーザー（管理者ロール等）のみ true */
  canManageProtection?: boolean;
  createdAt: string;
  updatedAt: string;
  content?: {
    id?: string;
    text: string;
    version: number;
    authorId: string;
    comments?: string | null;
    author?: User;
    _count?: { versions: number };
  };
  attachments?: Attachment[];
}

export interface Document {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  categoryId: string;
  authorId?: string;
  createdAt: string;
  updatedAt?: string;
  category?: {
    id: string;
    name: string;
    type?: string;
  };
  author?: {
    id: string;
    login: string;
    firstname: string;
    lastname: string;
  };
  attachments?: Attachment[];
}

export interface News {
  id: string;
  projectId: string;
  title: string;
  summary: string | null;
  description: string | null;
  authorId: string;
  author?: User;
  createdAt: string;
  updatedAt?: string;
  comments?: Comment[];
  attachments?: Attachment[];
}

export interface Comment {
  id: string;
  content: string;
  authorId: string;
  parentId?: string | null;
  author?: User;
  createdAt: string;
  updatedAt?: string;
  replies?: Comment[];
}

export interface Board {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  position: number;
  createdByUserId?: string | null;
  /** GET /boards で付与（親メッセージ数） */
  topicCount?: number;
}

export interface Message {
  id: string;
  boardId: string;
  parentId: string | null;
  authorId: string;
  subject: string;
  content: string | null;
  locked: boolean;
  sticky: boolean;
  createdAt: string;
  updatedAt?: string;
  author?: User;
  replies?: Message[];
  _count?: { replies: number };
  /** トピック一覧 API で付与 */
  replyCount?: number;
}

export interface Role {
  id: string;
  name: string;
  position: number;
  assignable: boolean;
  builtin: number;
  permissions: string | string[]; // Can be string (old data) or array (new data)
  createdAt?: string;
}

export interface Group {
  id: string;
  name: string;
  userCount?: number;
  createdAt?: string;
  updatedAt?: string;
  groupUsers?: { user: User }[];
}

export interface GroupProjectAssignment {
  memberId: string;
  projectId: string;
  projectName: string;
  projectIdentifier: string;
  roles: Role[];
}

export interface GroupDetail {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  users: User[];
  projects: GroupProjectAssignment[];
}

export type UserProjectAssignment = GroupProjectAssignment;

export interface UserDetail extends User {
  groups?: Group[];
  projects?: UserProjectAssignment[];
}

export interface MailNotificationPreference {
  mailNotificationsEnabled: boolean;
  canCustomizeDueSummaryNotification: boolean;
  dueSummaryNotification: {
    enabled: boolean;
    sendTime: string;
    ranges: DueSummaryNotificationRange[];
    includeAuthoredAssignedToOthers: boolean;
  };
}

export type DueSummaryNotificationRange =
  | '5_days_before'
  | '4_days_before'
  | '3_days_before'
  | '2_days_before'
  | '1_day_before'
  | 'due_today'
  | 'overdue'
  | 'estimated_hours_exceeds_remaining_days';

export interface MyWatcherItem {
  id: string;
  watchableType: 'Issue' | 'Board' | 'Message' | 'WikiPage';
  watchableId: string;
  title: string;
  subtitle: string | null;
  updatedAt: string;
  url: string;
  project: Pick<Project, 'id' | 'name' | 'identifier'>;
}

export interface MyParticipatingProject {
  projectId: string;
  projectName: string;
  projectIdentifier: string;
  description: string | null;
  childProjectNames: string[];
  roles: string[];
}

export interface TotpStatus {
  totpEnabled: boolean;
  delivery: 'email';
  mail?: string;
  expiresInMinutes: number;
}

export interface TotpSetup {
  delivery: 'email';
  mail: string;
  expiresInMinutes: number;
}

export interface Member {
  id: string;
  projectId: string;
  userId: string | null;
  groupId: string | null;
  user?: User;
  group?: Group;
  memberRoles?: { role: Role }[];
}

export interface Query {
  id: string;
  name: string;
  type: string;
  userId?: string | null;
  projectId?: string | null;
  visibility: number;
  filters: Record<string, unknown>;
  columns: string[];
  sortCriteria: string[];
  groupBy: string | null;
  project?: Pick<Project, 'id' | 'name' | 'identifier'> | null;
  user?: Pick<User, 'id' | 'login' | 'firstname' | 'lastname'> | null;
}

export interface Attachment {
  id: string;
  filename: string;
  diskFilename?: string;
  filesize: number;
  contentType: string | null;
  description: string | null;
  createdAt: string;
}

export interface Activity {
  id: string;
  actType: string;
  actId: string;
  title: string;
  description: string | null;
  projectId: string | null;
  userId: string | null;
  createdAt: string;
  project?: Project;
  user?: Pick<User, 'id' | 'login' | 'firstname' | 'lastname'> | null;
}

export interface CustomField {
  id: string;
  type: string;
  name: string;
  fieldFormat: string;
  isRequired: boolean;
  position: number;
  defaultValue?: string | null;
  possibleValues?: string[] | string | null;
  isFilter?: boolean;
  searchable?: boolean;
  multiple?: boolean;
  isForAll?: boolean;
  trackerIds?: string[];
  projectIds?: string[];
}

/** User account status (numeric codes used by the API). */
export const UserStatusCode = {
  Active: 1,
  Registered: 2,
  Locked: 3,
} as const;

export interface IssueStatusUsage {
  inUse: boolean;
  count: number;
}

export interface Setting {
  name: string;
  value: string;
}

export type SearchResultType = 'issues' | 'news' | 'documents' | 'wiki' | 'messages';

export interface SearchResultItem {
  id: string;
  type: SearchResultType;
  subtype?: string;
  title: string;
  excerpt: string;
  href: string;
  project: { id: string; name: string; identifier: string };
  createdAt?: string;
  updatedAt?: string | null;
}

export interface SearchResponse {
  q: string;
  scope: string;
  types: SearchResultType[];
  total: number;
  results: Partial<Record<SearchResultType, SearchResultItem[]>>;
}

export interface Pagination {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  pagination?: Pagination;
  error?: { code: string; message: string };
}

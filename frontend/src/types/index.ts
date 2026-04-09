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
  bookmarked: boolean;
  createdAt: string;
  updatedAt: string;
  enabledModules?: { name: string }[];
  _count?: { issues?: number; members?: number };
}

export interface Tracker {
  id: string;
  name: string;
  position: number;
  defaultStatusId: string | null;
  description: string | null;
}

export interface IssueStatus {
  id: string;
  name: string;
  isClosed: boolean;
  position: number;
}

export interface Issue {
  id: string;
  subject: string;
  description: string | null;
  projectId: string;
  trackerId: string;
  statusId: string;
  priority: number;
  authorId: string;
  assigneeId: string | null;
  categoryId: string | null;
  versionId: string | null;
  parentId: string | null;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  doneRatio: number;
  closedOn: string | null;
  createdAt: string;
  updatedAt: string;
  project?: Project;
  tracker?: Tracker;
  status?: IssueStatus;
  author?: User;
  assignee?: User | null;
  journals?: Journal[];
}

export interface Journal {
  id: string;
  issueId: string;
  userId: string;
  notes: string | null;
  private: boolean;
  createdAt: string;
  user?: User;
  details?: JournalDetail[];
}

export interface JournalDetail {
  id: string;
  property: string;
  propKey: string;
  oldValue: string | null;
  newValue: string | null;
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

export interface WikiPage {
  id: string;
  title: string;
  protected: boolean;
  createdAt: string;
  updatedAt: string;
  content?: { text: string; version: number; authorId: string; author?: User };
}

export interface Document {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  categoryId: string;
  createdAt: string;
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
  comments?: Comment[];
}

export interface Comment {
  id: string;
  content: string;
  authorId: string;
  author?: User;
  createdAt: string;
}

export interface Board {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  position: number;
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
  author?: User;
  replies?: Message[];
  _count?: { replies: number };
}

export interface Role {
  id: string;
  name: string;
  position: number;
  assignable: boolean;
  builtin: number;
  permissions: string;
}

export interface Group {
  id: string;
  name: string;
  groupUsers?: { user: User }[];
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
  visibility: number;
  filters: Record<string, unknown>;
  columns: string[];
  sortCriteria: string[];
  groupBy: string | null;
}

export interface Attachment {
  id: string;
  filename: string;
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
}

export interface CustomField {
  id: string;
  type: string;
  name: string;
  fieldFormat: string;
  isRequired: boolean;
  position: number;
  defaultValue?: string | null;
  possibleValues?: string | null;
  isFilter?: boolean;
  searchable?: boolean;
  multiple?: boolean;
  trackerIds?: string[];
}

/** User account status (numeric codes used by the API). */
export const UserStatusCode = {
  Active: 1,
  Registered: 2,
  Locked: 3,
} as const;

export interface WorkflowSnapshot {
  trackerId: string;
  roleId: string;
  /** Map: fromStatusId → allowed target status ids */
  allowedTransitions: Record<string, string[]>;
}

export interface CopyWorkflowPayload {
  sourceTrackerId: string;
  sourceRoleId: string;
  targetTrackerIds: string[];
  targetRoleIds: string[];
}

export interface IssueStatusUsage {
  inUse: boolean;
  count: number;
}

export interface Setting {
  name: string;
  value: string;
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

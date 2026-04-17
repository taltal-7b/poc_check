import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './client';
import type { ApiResponse, Project, Issue, User, TimeEntry, WikiPage, News, Board, Message, Version, Role, Group, Tracker, IssueStatus, Enumeration, Activity, Query as SavedQuery, Document, Member, CustomField, WorkflowSnapshot, CopyWorkflowPayload, IssueStatusUsage } from '../types';

function get<T>(url: string, params?: Record<string, unknown>) {
  return api.get<ApiResponse<T>>(url, { params }).then(r => r.data);
}

function post<T>(url: string, body?: unknown) {
  return api.post<ApiResponse<T>>(url, body).then(r => r.data);
}

function put<T>(url: string, body?: unknown) {
  return api.put<ApiResponse<T>>(url, body).then(r => r.data);
}

function del<T>(url: string) {
  return api.delete<ApiResponse<T>>(url).then(r => r.data);
}

// ========== Auth ==========
export const useMe = () => useQuery({ 
  queryKey: ['me'], 
  queryFn: () => get<User>('/auth/me'), 
  retry: false,
  staleTime: 5 * 60 * 1000, // 5 minutes - prevent frequent refetches
  gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
});
export const useLogin = () =>
  useMutation({
    mutationFn: (body: { login: string; password: string; totpCode?: string }) =>
      post<{ accessToken: string; refreshToken: string; user: User; totpRequired?: boolean }>('/auth/login', body),
  });
export const useRegister = () => useMutation({ mutationFn: (body: { login: string; firstname: string; lastname: string; mail: string; password: string }) => post('/auth/register', body) });

// ========== Projects ==========
export const useProjects = (params?: Record<string, unknown>) => useQuery({ queryKey: ['projects', params], queryFn: () => get<Project[]>('/projects', params) });
export const useProject = (id: string) => useQuery({ queryKey: ['project', id], queryFn: () => get<Project>(`/projects/${id}`), enabled: !!id });
type ProjectWriteBody = Omit<Partial<Project>, 'enabledModules'> & {
  enabledModules?: string[];
  trackerIds?: string[];
};

export const useCreateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectWriteBody) => post<Project>('/projects', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
};
export const useUpdateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ProjectWriteBody) => put<Project>(`/projects/${id}`, body),
    onSuccess: (_res, variables) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', variables.id] });
      qc.invalidateQueries({ queryKey: ['project'] });
    },
  });
};
export const useDeleteProject = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => del(`/projects/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }) }); };

// ========== Issues ==========
export const useIssues = (params?: Record<string, unknown>, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['issues', params],
    queryFn: () => get<Issue[]>('/issues', params),
    enabled: options?.enabled ?? true,
  });
export const useProjectIssues = (projectId: string, params?: Record<string, unknown>, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['issues', projectId, params],
    queryFn: () => get<Issue[]>(`/projects/${projectId}/issues`, params),
    enabled: (options?.enabled ?? true) && !!projectId,
  });
export const useIssue = (id: string) => useQuery({ queryKey: ['issue', id], queryFn: () => get<Issue>(`/issues/${id}`), enabled: !!id });
export const useCreateIssue = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (body: Partial<Issue>) => post<Issue>('/issues', body), onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }) }); };
export const useUpdateIssue = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => put<Issue>(`/issues/${id}`, body), onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ['issues'] }); qc.invalidateQueries({ queryKey: ['issue', v.id] }); } }); };
export const useDeleteIssue = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => del(`/issues/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }) }); };

// ========== Journals ==========
export const useUpdateJournal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => put(`/journals/${id}`, { notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['issue'] }); },
  });
};
export const useDeleteJournal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/journals/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['issue'] }); },
  });
};

// ========== Attachments ==========
export const useDeleteAttachment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/attachments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue'] });
    },
  });
};

export const useUploadAttachments = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ files, issueId, journalId }: { files: File[]; issueId?: string; journalId?: string }) => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const meta: Record<string, string> = {};
      if (issueId) meta.issueId = issueId;
      if (journalId) meta.journalId = journalId;
      if (Object.keys(meta).length) fd.append('meta', JSON.stringify(meta));
      return api.post<ApiResponse<{ attachments: unknown[] }>>('/attachments/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue'] });
    },
  });
};

// ========== Time Entries ==========
export const useTimeEntries = (params?: Record<string, unknown>) => useQuery({ queryKey: ['timeEntries', params], queryFn: () => get<TimeEntry[]>('/time_entries', params) });
export const useCreateTimeEntry = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (body: Partial<TimeEntry>) => post<TimeEntry>('/time_entries', body), onSuccess: () => qc.invalidateQueries({ queryKey: ['timeEntries'] }) }); };
export const useDeleteTimeEntry = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => del(`/time_entries/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['timeEntries'] }) }); };
export const useTimeEntryReport = (params?: Record<string, unknown>) => useQuery({ queryKey: ['timeReport', params], queryFn: () => get<unknown>('/time_entries/report', params) });

// ========== Wiki ==========
export const useWikiPages = (projectId: string) => useQuery({ queryKey: ['wiki', projectId], queryFn: () => get<WikiPage[]>(`/projects/${projectId}/wiki`), enabled: !!projectId });
export const useWikiPage = (projectId: string, title: string) => useQuery({ queryKey: ['wiki', projectId, title], queryFn: () => get<WikiPage>(`/projects/${projectId}/wiki/${encodeURIComponent(title)}`), enabled: !!projectId && !!title });
export const useCreateWikiPage = (projectId: string) => { const qc = useQueryClient(); return useMutation({ mutationFn: (body: { title: string; text: string }) => post<WikiPage>(`/projects/${projectId}/wiki`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['wiki', projectId] }) }); };
export const useUpdateWikiPage = (projectId: string) => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ title, ...body }: { title: string; text: string; comments?: string }) => put<WikiPage>(`/projects/${projectId}/wiki/${encodeURIComponent(title)}`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['wiki', projectId] }) }); };

// ========== News ==========
export const useNewsList = (params?: Record<string, unknown>) => useQuery({ queryKey: ['news', params], queryFn: () => get<News[]>('/news', params) });
export const useProjectNews = (projectId: string) => useQuery({ queryKey: ['news', projectId], queryFn: () => get<News[]>(`/projects/${projectId}/news`), enabled: !!projectId });
export const useNewsItem = (id: string) => useQuery({ queryKey: ['newsItem', id], queryFn: () => get<News>(`/news/${id}`), enabled: !!id });

// ========== Boards & Messages ==========
export const useBoards = (projectId: string) => useQuery({ queryKey: ['boards', projectId], queryFn: () => get<Board[]>(`/projects/${projectId}/boards`), enabled: !!projectId });
export const useBoardMessages = (projectId: string, boardId: string, params?: Record<string, unknown>) => useQuery({ queryKey: ['messages', boardId, params], queryFn: () => get<Message[]>(`/projects/${projectId}/boards/${boardId}/messages`, params), enabled: !!projectId && !!boardId });

// ========== Versions ==========
export const useVersions = (projectId: string) => useQuery({ queryKey: ['versions', projectId], queryFn: () => get<Version[]>(`/projects/${projectId}/versions`), enabled: !!projectId });
export const useCreateVersion = (projectId: string) => { const qc = useQueryClient(); return useMutation({ mutationFn: (body: Partial<Version>) => post<Version>(`/projects/${projectId}/versions`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['versions', projectId] }) }); };

// ========== Users (admin) ==========
export const useUsers = (params?: Record<string, unknown>) => useQuery({ queryKey: ['users', params], queryFn: () => get<User[]>('/users', params) });
export const useUser = (id: string) => useQuery({ queryKey: ['user', id], queryFn: () => get<User>(`/users/${id}`), enabled: !!id });
export const useCreateUser = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (body: Record<string, unknown>) => post<User>('/users', body), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) }); };
export const useUpdateUser = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => put<User>(`/users/${id}`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) }); };
export const useDeleteUser = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => del(`/users/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) }); };

// ========== Roles ==========
export const useRoles = () => useQuery({ queryKey: ['roles'], queryFn: () => get<Role[]>('/roles') });

// ========== Groups ==========
export const useGroups = () => useQuery({ queryKey: ['groups'], queryFn: () => get<Group[]>('/groups') });

// ========== Trackers ==========
export const useTrackers = () => useQuery({ queryKey: ['trackers'], queryFn: () => get<Tracker[]>('/trackers') });

// ========== Statuses ==========
export const useStatuses = () => useQuery({ queryKey: ['statuses'], queryFn: () => get<IssueStatus[]>('/issue_statuses') });

// ========== Enumerations ==========
export const useEnumerations = (type?: string) => useQuery({ queryKey: ['enumerations', type], queryFn: () => get<Enumeration[]>('/enumerations', type ? { type } : undefined) });

// ========== Activities ==========
export const useActivities = (params?: Record<string, unknown>) => useQuery({ queryKey: ['activities', params], queryFn: () => get<Activity[]>('/activities', params) });

// ========== Documents ==========
export const useDocuments = (projectId: string) => useQuery({ queryKey: ['documents', projectId], queryFn: () => get<Document[]>(`/projects/${projectId}/documents`), enabled: !!projectId });

// ========== Members ==========
export const useMembers = (projectId: string) => useQuery({ queryKey: ['members', projectId], queryFn: () => get<Member[]>(`/projects/${projectId}/members`), enabled: !!projectId });

// ========== Custom Fields ==========
export const useCustomFields = () => useQuery({ queryKey: ['customFields'], queryFn: () => get<CustomField[]>('/custom_fields') });

// ========== Queries ==========
export const useSavedQueries = () => useQuery({ queryKey: ['queries'], queryFn: () => get<SavedQuery[]>('/queries') });

// ========== Settings ==========
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => get<Record<string, string>>('/settings') });
export const useUpdateSettings = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (body: Record<string, string>) => put('/settings', body), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }) }); };
export const useTestEmail = () => useMutation({ mutationFn: () => post('/settings/test_email') });

// ========== Roles (admin) ==========
type RoleWriteBody = Omit<Partial<Role>, 'permissions'> & { permissions?: string[] };

export const useCreateRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RoleWriteBody) => post<Role>('/roles', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
};
export const useUpdateRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & RoleWriteBody) =>
      put<Role>(`/roles/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
};
export const useDeleteRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/roles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
};

// ========== Trackers (admin) ==========
export const useCreateTracker = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: Partial<Tracker>) => post<Tracker>('/trackers', body), onSuccess: () => qc.invalidateQueries({ queryKey: ['trackers'] }) });
};
export const useUpdateTracker = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Tracker>) => put<Tracker>(`/trackers/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trackers'] }),
  });
};
export const useDeleteTracker = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => del(`/trackers/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['trackers'] }) });
};
export const useReorderTrackers = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: { ids: string[] }) => put('/trackers/reorder', body), onSuccess: () => qc.invalidateQueries({ queryKey: ['trackers'] }) });
};

// ========== Issue statuses (admin) ==========
export const useCreateIssueStatus = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: Partial<IssueStatus>) => post<IssueStatus>('/issue_statuses', body), onSuccess: () => qc.invalidateQueries({ queryKey: ['statuses'] }) });
};
export const useUpdateIssueStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<IssueStatus>) => put<IssueStatus>(`/issue_statuses/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['statuses'] }),
  });
};
export const useDeleteIssueStatus = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => del(`/issue_statuses/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['statuses'] }) });
};
export const useIssueStatusUsage = (id: string) =>
  useQuery({ queryKey: ['issueStatusUsage', id], queryFn: () => get<IssueStatusUsage>(`/issue_statuses/${id}/usage`), enabled: !!id });

// ========== Workflows ==========
export const useWorkflow = (trackerId: string, roleId: string) =>
  useQuery({
    queryKey: ['workflow', trackerId, roleId],
    queryFn: () => get<WorkflowSnapshot>('/workflows', { trackerId, roleId }),
    enabled: !!trackerId && !!roleId,
  });
export const useUpdateWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WorkflowSnapshot) => put('/workflows', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow'] }),
  });
};
export const useCopyWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CopyWorkflowPayload) => post('/workflows/copy', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow'] }),
  });
};

// ========== Custom fields (admin) ==========
export const useCreateCustomField = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: Record<string, unknown>) => post<CustomField>('/custom_fields', body), onSuccess: () => qc.invalidateQueries({ queryKey: ['customFields'] }) });
};
export const useUpdateCustomField = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => put<CustomField>(`/custom_fields/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customFields'] }),
  });
};
export const useDeleteCustomField = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => del(`/custom_fields/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['customFields'] }) });
};

// ========== Enumerations (admin) ==========
export const useCreateEnumeration = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: Partial<Enumeration> & { type: string }) => post<Enumeration>('/enumerations', body), onSuccess: () => qc.invalidateQueries({ queryKey: ['enumerations'] }) });
};
export const useUpdateEnumeration = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Enumeration>) => put<Enumeration>(`/enumerations/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['enumerations'] }),
  });
};
export const useDeleteEnumeration = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => del(`/enumerations/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['enumerations'] }) });
};

// ========== Search ==========
export const useSearch = (params: { q: string; scope?: string; types?: string }) => useQuery({ queryKey: ['search', params], queryFn: () => get<Record<string, unknown[]>>('/search', params), enabled: !!params.q });

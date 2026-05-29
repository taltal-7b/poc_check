import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import api from './client';
import { useAuthStore } from '../stores/auth';
import type { ApiResponse, Project, ProjectAiBottleneckDetection, ProjectAiProgressSummary, ProjectAiTaskInstruction, ProjectAiWeeklyReport, Issue, IssueCategory, User, UserDetail, TimeEntry, WikiPage, News, Board, Message, Role, Group, GroupDetail, Tracker, IssueStatus, Enumeration, Activity, Query as SavedQuery, Document, Member, CustomField, IssueStatusUsage, MailNotificationPreference, MyWatcherItem, MyParticipatingProject, TotpSetup, TotpStatus, SearchResponse, ProjectFile, ProjectFilesPayload } from '../types';

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
export const useMe = () => {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['me', accessToken],
    queryFn: () => get<User>('/auth/me'),
    enabled: !!accessToken,
    retry: false,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
  });
};
export const useUpdateMe = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Pick<User, 'firstname' | 'lastname' | 'mail' | 'language'>) => put<User>('/my', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
};
export const useMyWatchers = () => {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['myWatchers', accessToken],
    queryFn: () => get<MyWatcherItem[]>('/my/watchers'),
    enabled: !!accessToken,
  });
};
export const useMyProjects = () => {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['myProjects', accessToken],
    queryFn: () => get<MyParticipatingProject[]>('/my/projects'),
    enabled: !!accessToken,
  });
};
export const useLogin = () =>
  useMutation({
    mutationFn: (body: { login: string; password: string }) =>
      post<{ accessToken?: string; refreshToken?: string; user?: User; totpRequired?: boolean; token?: string }>('/auth/login', body),
  });
export const useLoginTotp = () =>
  useMutation({
    mutationFn: (body: { token: string; code: string }) =>
      post<{ accessToken: string; refreshToken: string; user: User }>('/auth/login/totp', body),
  });
export const useRegister = () => useMutation({ mutationFn: (body: { login: string; firstname: string; lastname: string; mail: string; password: string }) => post('/auth/register', body) });
export const useRequestPasswordReset = () =>
  useMutation({
    mutationFn: (body: { mail: string }) => post<{ ok: boolean; message: string }>('/auth/password/reset', body),
  });
export const useConfirmPasswordReset = () =>
  useMutation({
    mutationFn: (body: { token: string; password: string; passwordConfirmation: string }) =>
      post<{ ok: boolean; message: string }>('/auth/password/reset/confirm', body),
  });

export const useTotpStatus = () =>
  useQuery({
    queryKey: ['totpStatus'],
    queryFn: () => get<TotpStatus>('/auth/totp/status'),
  });
export const useSetupTotp = () => useMutation({ mutationFn: (body: { currentPassword: string }) => post<TotpSetup>('/auth/totp/setup', body) });
export const useConfirmTotp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string }) => post<TotpStatus>('/auth/totp/confirm', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['totpStatus'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
};
export const useDisableTotp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { currentPassword: string }) => post<TotpStatus>('/auth/totp/disable', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['totpStatus'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
};

export const useMailNotificationPreference = () =>
  useQuery({
    queryKey: ['mailNotificationPreference'],
    queryFn: () => get<MailNotificationPreference>('/my/mail_notifications'),
  });
export const useUpdateMailNotificationPreference = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MailNotificationPreference) => put<MailNotificationPreference>('/my/mail_notifications', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mailNotificationPreference'] }),
  });
};

// ========== Projects ==========
export const useProjects = (params?: Record<string, unknown>, options?: { enabled?: boolean }) =>
  useQuery({ queryKey: ['projects', params], queryFn: () => get<Project[]>('/projects', params), enabled: options?.enabled });
export const useAllProjects = (options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['projects', 'all'],
    queryFn: async () => {
      const firstPage = await get<Project[]>('/projects', { page: 1, per_page: 100 });
      const totalPages = firstPage.pagination?.totalPages ?? 1;
      if (totalPages <= 1) return firstPage;

      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          get<Project[]>('/projects', { page: index + 2, per_page: 100 }),
        ),
      );

      return {
        ...firstPage,
        data: [...firstPage.data, ...rest.flatMap((page) => page.data)],
      };
    },
    enabled: options?.enabled ?? true,
  });
export const useProject = (
  id: string,
  options?: { enabled?: boolean; refetchOnMount?: boolean | 'always'; cacheScope?: string },
) =>
  useQuery({
    queryKey: ['project', id, options?.cacheScope ?? 'default'],
    queryFn: () => get<Project>(`/projects/${id}`),
    enabled: options?.enabled ?? !!id,
    refetchOnMount: options?.refetchOnMount ?? true,
  });
type ProjectWriteBody = Omit<Partial<Project>, 'enabledModules'> & {
  enabledModules?: string[];
  trackerIds?: string[];
  customFieldIds?: string[];
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
export const useProjectAiProgressSummary = () =>
  useMutation({
    mutationFn: (projectId: string) => post<ProjectAiProgressSummary>(`/projects/${projectId}/ai/progress-summary`),
  });
export const useProjectAiWeeklyReport = () =>
  useMutation({
    mutationFn: (projectId: string) => post<ProjectAiWeeklyReport>(`/projects/${projectId}/ai/weekly-report`),
  });
export const useProjectAiBottleneckDetection = () =>
  useMutation({
    mutationFn: (projectId: string) => post<ProjectAiBottleneckDetection>(`/projects/${projectId}/ai/bottleneck-detection`),
  });
export const useProjectAiTaskInstruction = () =>
  useMutation({
    mutationFn: (projectId: string) => post<ProjectAiTaskInstruction>(`/projects/${projectId}/ai/task-instruction`),
  });
export const useProjectIssueCategories = (projectId: string, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['projectIssueCategories', projectId],
    queryFn: () => get<IssueCategory[]>(`/projects/${projectId}/issue_categories`),
    enabled: (options?.enabled ?? true) && !!projectId,
  });

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
export const useAllIssues = (params?: Record<string, unknown>, options?: { enabled?: boolean }) => {
  const enabled = options?.enabled ?? true;
  const firstParams = useMemo(() => ({ ...params, per_page: 100, page: 1 }), [params]);
  const first = useQuery({
    queryKey: ['issues', 'all', firstParams],
    queryFn: () => get<Issue[]>('/issues', firstParams),
    enabled,
  });
  const totalPages = first.data?.pagination?.totalPages ?? 1;
  const rest = useQueries({
    queries: Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => {
      const page = index + 2;
      const pageParams = { ...params, per_page: 100, page };
      return {
        queryKey: ['issues', 'all', pageParams],
        queryFn: () => get<Issue[]>('/issues', pageParams),
        enabled: enabled && first.isSuccess,
      };
    }),
  });
  const data = useMemo(() => {
    if (!first.data) return first.data;
    return {
      ...first.data,
      data: [
        ...(first.data.data ?? []),
        ...rest.flatMap((query) => query.data?.data ?? []),
      ],
    };
  }, [first.data, rest]);
  return {
    ...first,
    data,
    isLoading: first.isLoading || rest.some((query) => query.isLoading),
    isError: first.isError || rest.some((query) => query.isError),
  };
};
export const useAllProjectIssues = (projectId: string, params?: Record<string, unknown>, options?: { enabled?: boolean }) => {
  const enabled = (options?.enabled ?? true) && !!projectId;
  const firstParams = useMemo(() => ({ ...params, per_page: 100, page: 1 }), [params]);
  const first = useQuery({
    queryKey: ['issues', projectId, 'all', firstParams],
    queryFn: () => get<Issue[]>(`/projects/${projectId}/issues`, firstParams),
    enabled,
  });
  const totalPages = first.data?.pagination?.totalPages ?? 1;
  const rest = useQueries({
    queries: Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => {
      const page = index + 2;
      const pageParams = { ...params, per_page: 100, page };
      return {
        queryKey: ['issues', projectId, 'all', pageParams],
        queryFn: () => get<Issue[]>(`/projects/${projectId}/issues`, pageParams),
        enabled: enabled && first.isSuccess,
      };
    }),
  });
  const data = useMemo(() => {
    if (!first.data) return first.data;
    return {
      ...first.data,
      data: [
        ...(first.data.data ?? []),
        ...rest.flatMap((query) => query.data?.data ?? []),
      ],
    };
  }, [first.data, rest]);
  return {
    ...first,
    data,
    isLoading: first.isLoading || rest.some((query) => query.isLoading),
    isError: first.isError || rest.some((query) => query.isError),
  };
};
export const useIssue = (id: string) => useQuery({ queryKey: ['issue', id], queryFn: () => get<Issue>(`/issues/${id}`), enabled: !!id });
export const useCreateIssue = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (body: Partial<Issue>) => post<Issue>('/issues', body), onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }) }); };
export const useUpdateIssue = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => put<Issue>(`/issues/${id}`, body), onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ['issues'] }); qc.invalidateQueries({ queryKey: ['issue', v.id] }); } }); };
export const useDeleteIssue = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => del(`/issues/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }) }); };
export const useBulkUpdateIssues = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (body: { ids: string[]; changes: Record<string, unknown> }) => post<{ updated: number; issues: Issue[] }>('/issues/bulk_update', body), onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }) }); };
export const useBulkDeleteIssues = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (ids: string[]) => post<{ deleted: number; ids: string[] }>('/issues/bulk_delete', { ids }), onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }) }); };

export type WatchableType = 'Issue' | 'Board' | 'Message' | 'WikiPage';
export type WatcherPayload = {
  watching: boolean;
  watchers: Array<{ user: Pick<User, 'id' | 'login' | 'firstname' | 'lastname'> }>;
};

export const useWatcher = (watchableType: WatchableType, watchableId: string, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['watcher', watchableType, watchableId],
    queryFn: () => get<WatcherPayload>('/watchers', { watchableType, watchableId }),
    enabled: (options?.enabled ?? true) && !!watchableType && !!watchableId,
  });

export const useToggleWatcher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ watchableType, watchableId, watching }: { watchableType: WatchableType; watchableId: string; watching: boolean }) => {
      const body = { watchableType, watchableId };
      return watching
        ? api.delete<ApiResponse<{ watching: boolean }>>('/watchers', { data: body }).then((r) => r.data)
        : post<{ watching: boolean; watcher: { id: string } }>('/watchers', body);
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['watcher', vars.watchableType, vars.watchableId] });
      qc.invalidateQueries({ queryKey: ['myWatchers'] });
      if (vars.watchableType === 'Issue') qc.invalidateQueries({ queryKey: ['issue', vars.watchableId] });
      if (vars.watchableType === 'Board') qc.invalidateQueries({ queryKey: ['boards'] });
      if (vars.watchableType === 'Message') qc.invalidateQueries({ queryKey: ['boardMessage'] });
      if (vars.watchableType === 'WikiPage') qc.invalidateQueries({ queryKey: ['wiki'] });
    },
  });
};

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
    mutationFn: ({
      files,
      issueId,
      journalId,
      containerType,
      containerId,
      description,
    }: {
      files: File[];
      issueId?: string;
      journalId?: string;
      containerType?: string;
      containerId?: string;
      description?: string;
    }) => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const meta: Record<string, string> = {};
      if (issueId) meta.issueId = issueId;
      if (journalId) meta.journalId = journalId;
      if (containerType) meta.containerType = containerType;
      if (containerId) meta.containerId = containerId;
      if (description) meta.description = description;
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
export const useTimeEntries = (params?: Record<string, unknown>, options?: { enabled?: boolean }) => useQuery({
  queryKey: ['timeEntries', params],
  queryFn: () => get<TimeEntry[]>('/time_entries', params),
  enabled: options?.enabled ?? true,
});
function invalidateTimeEntryDependents(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['timeEntries'] });
  qc.invalidateQueries({ queryKey: ['timeReport'] });
  qc.invalidateQueries({ queryKey: ['issues'] });
  qc.invalidateQueries({ queryKey: ['issue'] });
}
export const useCreateTimeEntry = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (body: Partial<TimeEntry>) => post<TimeEntry>('/time_entries', body), onSuccess: () => invalidateTimeEntryDependents(qc) }); };
export const useUpdateTimeEntry = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...body }: { id: string } & Partial<TimeEntry>) => put<TimeEntry>(`/time_entries/${id}`, body), onSuccess: () => invalidateTimeEntryDependents(qc) }); };
export const useDeleteTimeEntry = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => del(`/time_entries/${id}`), onSuccess: () => invalidateTimeEntryDependents(qc) }); };
export const useTimeEntryReport = (params?: Record<string, unknown>) => useQuery({ queryKey: ['timeReport', params], queryFn: () => get<unknown>('/time_entries/report', params) });

// ========== Wiki ==========
export const useWikiPages = (projectId: string) =>
  useQuery({
    queryKey: ['wiki', projectId],
    queryFn: () =>
      get<{ wiki: { id: string; startPage: string } | null; pages: WikiPage[] }>(`/projects/${projectId}/wiki`),
    enabled: !!projectId,
  });
export const useWikiPage = (projectId: string, title: string) => useQuery({ queryKey: ['wiki', projectId, title], queryFn: () => get<WikiPage>(`/projects/${projectId}/wiki/${encodeURIComponent(title)}`), enabled: !!projectId && !!title });
export const useWikiHistory = (projectId: string, title: string) =>
  useQuery({
    queryKey: ['wiki-history', projectId, title],
    queryFn: () =>
      get<
        Array<{
          id: string;
          version: number;
          comments: string | null;
          authorId: string;
          createdAt: string;
          author?: { id: string; login: string; firstname: string; lastname: string } | null;
        }>
      >(
        `/projects/${projectId}/wiki/${encodeURIComponent(title)}/history`,
      ),
    enabled: !!projectId && !!title,
  });
export const useWikiDiff = (projectId: string, title: string, fromVersion?: number, toVersion?: number) =>
  useQuery({
    queryKey: ['wiki-diff', projectId, title, fromVersion, toVersion],
    queryFn: () =>
      get<{ fromVersion: number; toVersion: number; oldText: string; newText: string }>(
        `/projects/${projectId}/wiki/${encodeURIComponent(title)}/diff`,
        { from: fromVersion, to: toVersion },
      ),
    enabled:
      !!projectId &&
      !!title &&
      typeof fromVersion === 'number' &&
      typeof toVersion === 'number' &&
      fromVersion !== toVersion,
  });
export const useDeleteWikiVersion = (projectId: string, title: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) =>
      del(`/projects/${projectId}/wiki/${encodeURIComponent(title)}/version/${version}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wiki-history', projectId, title] });
      qc.invalidateQueries({ queryKey: ['wiki', projectId, title] });
      qc.invalidateQueries({ queryKey: ['wiki', projectId] });
    },
  });
};
export const useCreateWikiPage = (projectId: string) => { const qc = useQueryClient(); return useMutation({ mutationFn: (body: { title: string; text: string; comments?: string | null; attachmentIds?: string[] }) => post<WikiPage>(`/projects/${projectId}/wiki`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['wiki', projectId] }) }); };
export const useUpdateWikiPage = (projectId: string) => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ title, ...body }: { title: string; text: string; comments?: string | null; attachmentIds?: string[]; newTitle?: string }) => put<WikiPage>(`/projects/${projectId}/wiki/${encodeURIComponent(title)}`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['wiki', projectId] }) }); };

// ========== News ==========
export const useNewsList = (params?: Record<string, unknown>) => useQuery({ queryKey: ['news', params], queryFn: () => get<News[]>('/news', params) });
export const useProjectNews = (projectId: string, params?: Record<string, unknown>) =>
  useQuery({
    queryKey: ['news', projectId, params],
    queryFn: () => get<News[]>(`/projects/${projectId}/news`, params),
    enabled: !!projectId,
  });
export const useNewsItem = (id: string) => useQuery({ queryKey: ['newsItem', id], queryFn: () => get<News>(`/news/${id}`), enabled: !!id });
export const useProjectNewsItem = (projectId: string, newsId: string) =>
  useQuery({
    queryKey: ['newsItem', projectId, newsId],
    queryFn: () => get<News>(`/projects/${projectId}/news/${newsId}`),
    enabled: !!projectId && !!newsId,
  });
export const useCreateProjectNews = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; summary?: string | null; description?: string | null; attachmentIds?: string[] }) =>
      post<News>(`/projects/${projectId}/news`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['news', projectId] }),
  });
};
export const useUpdateProjectNews = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; title: string; summary?: string | null; description?: string | null }) =>
      put<News>(`/projects/${projectId}/news/${id}`, body),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['news', projectId] });
      qc.invalidateQueries({ queryKey: ['newsItem', projectId, vars.id] });
    },
  });
};

// ========== Boards & Messages ==========
export const useBoards = (projectId: string) =>
  useQuery({ queryKey: ['boards', projectId], queryFn: () => get<Board[]>(`/projects/${projectId}/boards`), enabled: !!projectId });

/** トピック一覧（親メッセージのみ・ページング）。Redmine の掲示板トピック一覧相当。 */
export const useBoardTopicsPage = (projectId: string, boardId: string, page: number, perPage = 10) =>
  useQuery({
    queryKey: ['boardTopics', projectId, boardId, page, perPage],
    queryFn: () =>
      get<(Message & { replyCount?: number })[]>(`/projects/${projectId}/boards/${boardId}/messages`, {
        page,
        per_page: perPage,
      }),
    enabled: !!projectId && !!boardId,
  });

export const useBoardMessage = (projectId: string, boardId: string, messageId: string) =>
  useQuery({
    queryKey: ['boardMessage', projectId, boardId, messageId],
    queryFn: () => get<Message>(`/projects/${projectId}/boards/${boardId}/messages/${messageId}`),
    enabled: !!projectId && !!boardId && !!messageId,
  });

// ========== Users (admin) ==========
export const useUsers = (params?: Record<string, unknown>, options?: { enabled?: boolean }) =>
  useQuery({ queryKey: ['users', params], queryFn: () => get<User[]>('/users', params), enabled: options?.enabled });
export const useUser = (id: string) => useQuery({ queryKey: ['user', id], queryFn: () => get<UserDetail>(`/users/${id}`), enabled: !!id });
export const useCreateUser = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (body: Record<string, unknown>) => post<User>('/users', body), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) }); };
export const useUpdateUser = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => put<User>(`/users/${id}`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) }); };
export const useDeleteUser = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => del(`/users/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) }); };
export const useAdminDisableTotp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => post<{ totpEnabled: boolean }>(`/users/${id}/totp/disable`),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', id] });
    },
  });
};
export const useAddUserProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId, roleIds }: { id: string; projectId: string; roleIds: string[] }) =>
      post(`/users/${id}/projects`, { projectId, roleIds }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', vars.id] });
    },
  });
};
export const useRemoveUserProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string }) => del(`/users/${id}/projects/${projectId}`),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', vars.id] });
    },
  });
};

// ========== Roles ==========
export const useRoles = (options?: { enabled?: boolean }) =>
  useQuery({ queryKey: ['roles'], queryFn: () => get<Role[]>('/roles'), enabled: options?.enabled });

// ========== Groups ==========
export const useGroups = (options?: { enabled?: boolean }) =>
  useQuery({ queryKey: ['groups'], queryFn: () => get<Group[]>('/groups'), enabled: options?.enabled });
export const useGroup = (id: string) =>
  useQuery({
    queryKey: ['group', id],
    queryFn: () => get<GroupDetail>(`/groups/${id}`),
    enabled: !!id,
  });
export const useCreateGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) => post<Group>('/groups', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
};
export const useUpdateGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => put<Group>(`/groups/${id}`, { name }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['group', vars.id] });
    },
  });
};
export const useDeleteGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/groups/${id}`),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.removeQueries({ queryKey: ['group', id] });
    },
  });
};
export const useAddGroupUsersBulk = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userIds }: { id: string; userIds: string[] }) =>
      post<{ added: number }>(`/groups/${id}/users/bulk`, { userIds }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['group', vars.id] });
    },
  });
};
export const useRemoveGroupUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) => del(`/groups/${id}/users/${userId}`),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['group', vars.id] });
      qc.invalidateQueries({ queryKey: ['user', vars.userId] });
    },
  });
};
export const useAddGroupUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) => post(`/groups/${id}/users`, { userId }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['group', vars.id] });
      qc.invalidateQueries({ queryKey: ['user', vars.userId] });
    },
  });
};
export const useAddGroupProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId, roleIds }: { id: string; projectId: string; roleIds: string[] }) =>
      post(`/groups/${id}/projects`, { projectId, roleIds }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['group', vars.id] });
    },
  });
};
export const useRemoveGroupProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string }) => del(`/groups/${id}/projects/${projectId}`),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['group', vars.id] });
    },
  });
};

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
export const useDocument = (projectId: string, id: string) =>
  useQuery({
    queryKey: ['document', projectId, id],
    queryFn: () => get<Document>(`/projects/${projectId}/documents/${id}`),
    enabled: !!projectId && !!id,
  });

// ========== Project Files ==========
export const useProjectFiles = (projectId: string) =>
  useQuery({
    queryKey: ['projectFiles', projectId],
    queryFn: () => get<ProjectFilesPayload>(`/projects/${projectId}/files`),
    enabled: !!projectId,
  });

export const useUploadProjectFiles = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ files, descriptions, versionId }: { files: File[]; descriptions?: string[]; versionId?: string }) => {
      const fd = new FormData();
      files.forEach((file) => fd.append('files', file));
      fd.append('meta', JSON.stringify({ descriptions, versionId: versionId || null }));
      return api.post<ApiResponse<{ files: ProjectFile[] }>>(`/projects/${projectId}/files`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projectFiles', projectId] }),
  });
};

export const useDeleteProjectFile = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/projects/${projectId}/files/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projectFiles', projectId] }),
  });
};

// ========== Members ==========
export const useMembers = (projectId: string) => useQuery({ queryKey: ['members', projectId], queryFn: () => get<Member[]>(`/projects/${projectId}/members`), enabled: !!projectId });
export const useProjectMemberGroups = (projectId: string) =>
  useQuery({
    queryKey: ['member-groups', projectId],
    queryFn: () => get<Group[]>(`/projects/${projectId}/members/groups`),
    enabled: !!projectId,
  });

// ========== Custom Fields ==========
export const useCustomFields = () => useQuery({ queryKey: ['customFields'], queryFn: () => get<CustomField[]>('/custom_fields') });
export const useProjectCustomFields = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: ['projectCustomFields', projectId],
    queryFn: () => get<CustomField[]>(`/projects/${projectId}/custom_fields`),
    enabled: enabled && !!projectId,
  });
export const useIssueCustomFields = (projectId: string, trackerId: string) =>
  useQuery({
    queryKey: ['issueCustomFields', projectId, trackerId],
    queryFn: () => get<CustomField[]>(`/projects/${projectId}/issues/custom_fields`, { trackerId }),
    enabled: !!projectId && !!trackerId,
  });

// ========== Queries ==========
export const useSavedQueries = (options?: { enabled?: boolean }) =>
  useQuery({ queryKey: ['queries'], queryFn: () => get<SavedQuery[]>('/queries'), enabled: options?.enabled });
export const useCreateSavedQuery = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<SavedQuery>) => post<SavedQuery>('/queries', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queries'] }),
  });
};
export const useDeleteSavedQuery = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/queries/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queries'] }),
  });
};

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
export const useSearch = (params: { q: string; scope?: string; types?: string }) => useQuery({ queryKey: ['search', params], queryFn: () => get<SearchResponse>('/search', params), enabled: !!params.q });

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import { useAuthStore } from './stores/auth';
import { useProject } from './api/hooks';

import { buildLoginNavigateTo } from './utils/return-path';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectNewPage = lazy(() => import('./pages/ProjectNewPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const ProjectSettingsPage = lazy(() => import('./pages/ProjectSettingsPage'));
const IssuesPage = lazy(() => import('./pages/IssuesPage'));
const IssueBoardPage = lazy(() => import('./pages/IssueBoardPage'));
const IssueNewPage = lazy(() => import('./pages/IssueNewPage'));
const IssueDetailPage = lazy(() => import('./pages/IssueDetailPage'));
const TimeEntriesPage = lazy(() => import('./pages/TimeEntriesPage'));
const WikiPage = lazy(() => import('./pages/WikiPage'));
const WikiEditPage = lazy(() => import('./pages/WikiEditPage'));
const WikiHistoryPage = lazy(() => import('./pages/WikiHistoryPage'));
const WikiDiffPage = lazy(() => import('./pages/WikiDiffPage'));
const NewsPage = lazy(() => import('./pages/NewsPage'));
const NewsNewPage = lazy(() => import('./pages/NewsNewPage'));
const NewsEditPage = lazy(() => import('./pages/NewsEditPage'));
const ForumsLayout = lazy(() => import('./pages/forums/ForumsLayout'));
const ForumBoardIndex = lazy(() => import('./pages/forums/ForumViews').then((module) => ({ default: module.ForumBoardIndex })));
const ForumEditBoard = lazy(() => import('./pages/forums/ForumViews').then((module) => ({ default: module.ForumEditBoard })));
const ForumEditTopic = lazy(() => import('./pages/forums/ForumViews').then((module) => ({ default: module.ForumEditTopic })));
const ForumNewBoard = lazy(() => import('./pages/forums/ForumViews').then((module) => ({ default: module.ForumNewBoard })));
const ForumNewTopic = lazy(() => import('./pages/forums/ForumViews').then((module) => ({ default: module.ForumNewTopic })));
const ForumTopicList = lazy(() => import('./pages/forums/ForumViews').then((module) => ({ default: module.ForumTopicList })));
const ForumTopicShow = lazy(() => import('./pages/forums/ForumViews').then((module) => ({ default: module.ForumTopicShow })));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const FilesPage = lazy(() => import('./pages/FilesPage'));
const GanttPage = lazy(() => import('./pages/GanttPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const MembersPage = lazy(() => import('./pages/MembersPage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const MyPagePage = lazy(() => import('./pages/MyPagePage'));
const MyAccountPage = lazy(() => import('./pages/MyAccountPage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const AdminUsersPage = lazy(() => import('./pages/admin/UsersPage'));
const AdminUserDetailPage = lazy(() => import('./pages/admin/UserDetailPage'));
const AdminRolesPage = lazy(() => import('./pages/admin/RolesPage'));
const AdminGroupsPage = lazy(() => import('./pages/admin/GroupsPage'));
const AdminGroupNewPage = lazy(() => import('./pages/admin/GroupNewPage'));
const AdminGroupDetailPage = lazy(() => import('./pages/admin/GroupDetailPage'));
const AdminTrackersPage = lazy(() => import('./pages/admin/TrackersPage'));
const AdminStatusesPage = lazy(() => import('./pages/admin/StatusesPage'));
const AdminCustomFieldsPage = lazy(() => import('./pages/admin/CustomFieldsPage'));
const AdminEnumerationsPage = lazy(() => import('./pages/admin/EnumerationsPage'));

const PROJECT_STATUS_ARCHIVED = 5;
const LEGACY_PROJECT_STATUS_ARCHIVED = 2;

function RouteLoading() {
  return <div className="flex min-h-screen items-center justify-center">読み込み中...</div>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to={buildLoginNavigateTo(`${location.pathname}${location.search}`)} replace />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
  
  // 認証されているが、userがまだロードされていない場合は待つ
  if (isAuthenticated && !user) {
    return <div className="flex items-center justify-center min-h-screen">読み込み中...</div>;
  }
  
  return user?.admin ? <>{children}</> : <Navigate to="/" />;
}

function ProjectModuleRoute({
  moduleKey,
  children,
}: {
  moduleKey: string;
  children: React.ReactNode;
}) {
  const { identifier } = useParams<{ identifier?: string }>();
  const projectId = identifier ?? '';
  const { data, isLoading } = useProject(projectId);

  if (!projectId) return <Navigate to="/projects" replace />;
  if (isLoading) return <div className="flex items-center justify-center min-h-screen">読み込み中...</div>;

  const project = data?.data;
  if (project?.status === PROJECT_STATUS_ARCHIVED || project?.status === LEGACY_PROJECT_STATUS_ARCHIVED) {
    return <Navigate to={`/projects/${project.identifier ?? projectId}/settings`} replace />;
  }

  const enabled = !!project?.enabledModules?.some((m) => m.name === moduleKey);
  if (!enabled) return <Navigate to={`/projects/${projectId}`} replace />;

  return <>{children}</>;
}

function ProjectSettingsOnlyRoute({ children }: { children: React.ReactNode }) {
  const { identifier } = useParams<{ identifier?: string }>();
  const projectId = identifier ?? '';
  const { data, isLoading } = useProject(projectId);

  if (!projectId) return <Navigate to="/projects" replace />;
  if (isLoading) return <div className="flex items-center justify-center min-h-screen">読み込み中...</div>;

  const project = data?.data;
  if (project?.status === PROJECT_STATUS_ARCHIVED || project?.status === LEGACY_PROJECT_STATUS_ARCHIVED) {
    return <Navigate to={`/projects/${project.identifier ?? projectId}/settings`} replace />;
  }

  return <>{children}</>;
}

function IssueCreateRoute({ children }: { children: React.ReactNode }) {
  const { identifier } = useParams<{ identifier?: string }>();
  const location = useLocation();
  const { user, isAuthenticated } = useAuthStore();
  const projectId = identifier ?? '';
  const projectQuery = useProject(projectId, {
    enabled: isAuthenticated && !!user?.id && !!projectId,
    refetchOnMount: 'always',
    cacheScope: user?.id ?? 'anon',
  });

  if (!projectId) return <Navigate to="/projects" replace />;
  if (!isAuthenticated) {
    return <Navigate to={buildLoginNavigateTo(`${location.pathname}${location.search}`)} replace />;
  }
  const project = projectQuery.data?.data;
  if (!user?.id || (projectQuery.isLoading && !project)) {
    return <div className="flex items-center justify-center min-h-screen">読み込み中...</div>;
  }

  if (projectQuery.isError) {
    return <Navigate to={`/projects/${projectId}/issues`} replace />;
  }

  if (!project?.permissions?.canCreateIssue) {
    return <Navigate to={`/projects/${project?.identifier ?? projectId}/issues`} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/password/forgot" element={<ForgotPasswordPage />} />
      <Route path="/password/reset" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route index element={<MyPagePage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/new" element={<AdminRoute><ProjectNewPage /></AdminRoute>} />
        <Route path="projects/:identifier/edit" element={<ProjectSettingsOnlyRoute><ProjectNewPage isEdit /></ProjectSettingsOnlyRoute>} />
        <Route path="projects/:identifier" element={<ProjectSettingsOnlyRoute><ProjectDetailPage /></ProjectSettingsOnlyRoute>} />
        <Route path="projects/:identifier/settings" element={<ProjectSettingsPage />} />
        <Route path="projects/:identifier/issues" element={<ProjectModuleRoute moduleKey="issue_tracking"><IssuesPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/issues/board" element={<ProjectModuleRoute moduleKey="issue_tracking"><IssueBoardPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/issues/new" element={<ProjectModuleRoute moduleKey="issue_tracking"><IssueCreateRoute><IssueNewPage /></IssueCreateRoute></ProjectModuleRoute>} />
        <Route path="projects/:identifier/issues/:issueId" element={<ProjectSettingsOnlyRoute><IssueDetailPage /></ProjectSettingsOnlyRoute>} />
        <Route path="projects/:identifier/time_entries" element={<ProjectModuleRoute moduleKey="time_tracking"><TimeEntriesPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/wiki" element={<ProjectModuleRoute moduleKey="wiki"><WikiPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/wiki/:title" element={<ProjectModuleRoute moduleKey="wiki"><WikiPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/wiki/:title/history" element={<ProjectModuleRoute moduleKey="wiki"><WikiHistoryPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/wiki/:title/diff" element={<ProjectModuleRoute moduleKey="wiki"><WikiDiffPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/wiki/:title/edit" element={<ProjectModuleRoute moduleKey="wiki"><WikiEditPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/news" element={<ProjectModuleRoute moduleKey="news"><NewsPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/news/new" element={<ProjectModuleRoute moduleKey="news"><NewsNewPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/news/:newsId" element={<ProjectModuleRoute moduleKey="news"><NewsPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/news/:newsId/edit" element={<ProjectModuleRoute moduleKey="news"><NewsEditPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/forums" element={<ProjectModuleRoute moduleKey="boards"><ForumsLayout /></ProjectModuleRoute>}>
          <Route index element={<ForumBoardIndex />} />
          <Route path="new" element={<ForumNewBoard />} />
          <Route path=":boardId/edit" element={<ForumEditBoard />} />
          <Route path=":boardId/topics/new" element={<ForumNewTopic />} />
          <Route path=":boardId/topics/:topicId/edit" element={<ForumEditTopic />} />
          <Route path=":boardId/topics/:topicId" element={<ForumTopicShow />} />
          <Route path=":boardId" element={<ForumTopicList />} />
        </Route>
        <Route path="projects/:identifier/documents" element={<ProjectModuleRoute moduleKey="documents"><DocumentsPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/documents/:documentId" element={<ProjectModuleRoute moduleKey="documents"><DocumentsPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/files" element={<ProjectModuleRoute moduleKey="files"><FilesPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/gantt" element={<ProjectModuleRoute moduleKey="gantt"><GanttPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/calendar" element={<ProjectModuleRoute moduleKey="calendar"><CalendarPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/members" element={<ProjectSettingsOnlyRoute><MembersPage /></ProjectSettingsOnlyRoute>} />
        <Route path="projects/:identifier/activity" element={<ProjectSettingsOnlyRoute><ActivityPage /></ProjectSettingsOnlyRoute>} />

        <Route path="issues" element={<IssuesPage />} />
        <Route path="issues/:issueId" element={<IssueDetailPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="search" element={<SearchPage />} />

        <Route path="users/:userId" element={<UserProfilePage />} />

        <Route path="my/page" element={<Navigate to="/" replace />} />
        <Route path="my/account" element={<Navigate to="/myaccount" replace />} />
        <Route path="myaccount" element={<MyAccountPage />} />

        <Route path="admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
        <Route path="admin/users/:userId" element={<AdminRoute><AdminUserDetailPage /></AdminRoute>} />
        <Route path="admin/roles" element={<AdminRoute><AdminRolesPage /></AdminRoute>} />
        <Route path="admin/groups" element={<AdminRoute><AdminGroupsPage /></AdminRoute>} />
        <Route path="admin/groups/new" element={<AdminRoute><AdminGroupNewPage /></AdminRoute>} />
        <Route path="admin/groups/:groupId" element={<AdminRoute><AdminGroupDetailPage /></AdminRoute>} />
        <Route path="admin/trackers" element={<AdminRoute><AdminTrackersPage /></AdminRoute>} />
        <Route path="admin/statuses" element={<AdminRoute><AdminStatusesPage /></AdminRoute>} />
        <Route path="admin/custom-fields" element={<AdminRoute><AdminCustomFieldsPage /></AdminRoute>} />
        <Route path="admin/enumerations" element={<AdminRoute><AdminEnumerationsPage /></AdminRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      </Routes>
    </Suspense>
  );
}

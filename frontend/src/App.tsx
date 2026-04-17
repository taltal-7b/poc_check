import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import { useAuthStore } from './stores/auth';
import { useProject } from './api/hooks';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectNewPage from './pages/ProjectNewPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectSettingsPage from './pages/ProjectSettingsPage';
import IssuesPage from './pages/IssuesPage';
import IssueNewPage from './pages/IssueNewPage';
import IssueDetailPage from './pages/IssueDetailPage';
import TimeEntriesPage from './pages/TimeEntriesPage';
import WikiPage from './pages/WikiPage';
import WikiEditPage from './pages/WikiEditPage';
import NewsPage from './pages/NewsPage';
import ForumsPage from './pages/ForumsPage';
import DocumentsPage from './pages/DocumentsPage';
import VersionsPage from './pages/VersionsPage';
import GanttPage from './pages/GanttPage';
import CalendarPage from './pages/CalendarPage';
import MembersPage from './pages/MembersPage';
import ActivityPage from './pages/ActivityPage';
import SearchPage from './pages/SearchPage';
import MyPagePage from './pages/MyPagePage';
import MyAccountPage from './pages/MyAccountPage';
import UserProfilePage from './pages/UserProfilePage';

import AdminUsersPage from './pages/admin/UsersPage';
import AdminRolesPage from './pages/admin/RolesPage';
import AdminTrackersPage from './pages/admin/TrackersPage';
import AdminStatusesPage from './pages/admin/StatusesPage';
import AdminWorkflowsPage from './pages/admin/WorkflowsPage';
import AdminCustomFieldsPage from './pages/admin/CustomFieldsPage';
import AdminEnumerationsPage from './pages/admin/EnumerationsPage';
import AdminSettingsPage from './pages/admin/SettingsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
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

  const enabled = !!data?.data.enabledModules?.some((m) => m.name === moduleKey);
  if (!enabled) return <Navigate to={`/projects/${projectId}`} replace />;

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/new" element={<ProtectedRoute><ProjectNewPage /></ProtectedRoute>} />
        <Route path="projects/:identifier/edit" element={<ProtectedRoute><ProjectNewPage isEdit /></ProtectedRoute>} />
        <Route path="projects/:identifier" element={<ProjectDetailPage />} />
        <Route path="projects/:identifier/settings" element={<ProtectedRoute><ProjectSettingsPage /></ProtectedRoute>} />
        <Route path="projects/:identifier/issues" element={<ProjectModuleRoute moduleKey="issue_tracking"><IssuesPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/issues/new" element={<ProtectedRoute><IssueNewPage /></ProtectedRoute>} />
        <Route path="projects/:identifier/issues/:issueId" element={<IssueDetailPage />} />
        <Route path="projects/:identifier/time_entries" element={<ProjectModuleRoute moduleKey="time_tracking"><TimeEntriesPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/wiki" element={<ProjectModuleRoute moduleKey="wiki"><WikiPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/wiki/:title" element={<ProjectModuleRoute moduleKey="wiki"><WikiPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/wiki/:title/edit" element={<ProjectModuleRoute moduleKey="wiki"><ProtectedRoute><WikiEditPage /></ProtectedRoute></ProjectModuleRoute>} />
        <Route path="projects/:identifier/news" element={<ProjectModuleRoute moduleKey="news"><NewsPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/forums" element={<ProjectModuleRoute moduleKey="boards"><ForumsPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/documents" element={<ProjectModuleRoute moduleKey="documents"><DocumentsPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/versions" element={<VersionsPage />} />
        <Route path="projects/:identifier/gantt" element={<ProjectModuleRoute moduleKey="gantt"><GanttPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/calendar" element={<ProjectModuleRoute moduleKey="calendar"><CalendarPage /></ProjectModuleRoute>} />
        <Route path="projects/:identifier/members" element={<MembersPage />} />
        <Route path="projects/:identifier/activity" element={<ActivityPage />} />

        <Route path="issues" element={<IssuesPage />} />
        <Route path="issues/:issueId" element={<IssueDetailPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="search" element={<SearchPage />} />

        <Route path="users/:userId" element={<UserProfilePage />} />

        <Route path="my/page" element={<ProtectedRoute><MyPagePage /></ProtectedRoute>} />
        <Route path="my/account" element={<ProtectedRoute><MyAccountPage /></ProtectedRoute>} />

        <Route path="admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
        <Route path="admin/roles" element={<AdminRoute><AdminRolesPage /></AdminRoute>} />
        <Route path="admin/trackers" element={<AdminRoute><AdminTrackersPage /></AdminRoute>} />
        <Route path="admin/statuses" element={<AdminRoute><AdminStatusesPage /></AdminRoute>} />
        <Route path="admin/workflows" element={<AdminRoute><AdminWorkflowsPage /></AdminRoute>} />
        <Route path="admin/custom-fields" element={<AdminRoute><AdminCustomFieldsPage /></AdminRoute>} />
        <Route path="admin/enumerations" element={<AdminRoute><AdminEnumerationsPage /></AdminRoute>} />
        <Route path="admin/settings" element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />
      </Route>
    </Routes>
  );
}

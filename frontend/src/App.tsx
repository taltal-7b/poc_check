import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProjectListPage from './pages/projects/ProjectListPage';
import ProjectDetailPage from './pages/projects/ProjectDetailPage';
import IssueListPage from './pages/issues/IssueListPage';
import CreateIssuePage from './pages/issues/CreateIssuePage';
import IssueDetailPage from './pages/issues/IssueDetailPage';
import TimeEntriesPage from './pages/time-entries/TimeEntriesPage';
import NewsListPage from './pages/news/NewsListPage';
import GanttPage from './pages/gantt/GanttPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import UsersPage from './pages/admin/UsersPage';
import RolesPage from './pages/admin/RolesPage';
import GroupsPage from './pages/admin/GroupsPage';
import CustomFieldsPage from './pages/admin/CustomFieldsPage';
import WorkflowsPage from './pages/admin/WorkflowsPage';

// Redirect component for /new routes
function NewProjectRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/projects?openModal=true', { replace: true });
  }, [navigate]);
  return null;
}

function NewTimeEntryRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/time-entries?openForm=true', { replace: true });
  }, [navigate]);
  return null;
}

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      
      {isAuthenticated ? (
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectListPage />} />
          <Route path="projects/new" element={<NewProjectRedirect />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="issues" element={<IssueListPage />} />
          <Route path="issues/new" element={<CreateIssuePage />} />
          <Route path="issues/:id" element={<IssueDetailPage />} />
          <Route path="news" element={<NewsListPage />} />
          <Route path="time-entries" element={<TimeEntriesPage />} />
          <Route path="time-entries/new" element={<NewTimeEntryRedirect />} />
          <Route path="gantt" element={<GanttPage />} />
          <Route path="projects/:projectId/gantt" element={<GanttPage />} />
          <Route path="admin" element={<AdminDashboardPage />} />
          <Route path="admin/users" element={<UsersPage />} />
          <Route path="admin/roles" element={<RolesPage />} />
          <Route path="admin/groups" element={<GroupsPage />} />
          <Route path="admin/custom-fields" element={<CustomFieldsPage />} />
          <Route path="admin/workflows" element={<WorkflowsPage />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  );
}

export default App;

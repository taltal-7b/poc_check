import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../lib/api';
import {
  Menu,
  LogOut,
  FolderKanban,
  ListTodo,
  Home,
  User,
  Clock,
  Calendar,
  Shield,
  Newspaper,
} from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await authApi.logout();
      logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      logout();
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <Link to="/" className="flex items-center space-x-2">
                <Menu className="w-6 h-6 text-primary-600" />
                <span className="text-xl font-bold text-gray-900">
                  プロジェクト管理
                </span>
              </Link>

              <nav className="hidden md:flex space-x-4">
                <Link
                  to="/"
                  className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  <Home className="w-4 h-4" />
                  <span>ホーム</span>
                </Link>
                <Link
                  to="/projects"
                  className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  <FolderKanban className="w-4 h-4" />
                  <span>プロジェクト</span>
                </Link>
                <Link
                  to="/issues"
                  className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  <ListTodo className="w-4 h-4" />
                  <span>課題</span>
                </Link>
                <Link
                  to="/news"
                  className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  <Newspaper className="w-4 h-4" />
                  <span>ニュース</span>
                </Link>
                <Link
                  to="/time-entries"
                  className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  <Clock className="w-4 h-4" />
                  <span>時間</span>
                </Link>
                <Link
                  to="/gantt"
                  className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  <Calendar className="w-4 h-4" />
                  <span>ガント</span>
                </Link>
                {user?.admin && (
                  <Link
                    to="/admin"
                    className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                  >
                    <Shield className="w-4 h-4" />
                    <span>管理</span>
                  </Link>
                )}
              </nav>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <User className="w-5 h-5 text-gray-500" />
                <span className="text-sm text-gray-700">
                  {user?.lastName} {user?.firstName}
                </span>
                {user?.admin && (
                  <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
                    管理者
                  </span>
                )}
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                <LogOut className="w-4 h-4" />
                <span>ログアウト</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}

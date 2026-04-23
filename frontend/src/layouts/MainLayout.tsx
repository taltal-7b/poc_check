import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';
import { useMe } from '../api/hooks';
import { useEffect, useState } from 'react';
import { Menu, X, Search, User, LogOut, Settings, ChevronDown } from 'lucide-react';

export default function MainLayout() {
  const { t } = useTranslation();
  const { isAuthenticated, logout, user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const meQuery = useMe();

  useEffect(() => {
    if (meQuery.data?.data && isAuthenticated) {
      setUser(meQuery.data.data as Parameters<typeof setUser>[0]);
    }
  }, [meQuery.data, isAuthenticated, setUser]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const navLinks = [
    { to: '/projects', label: t('nav.projects') },
    ...(isAuthenticated ? [
      { to: '/my/page', label: t('nav.myPage') },
      { to: '/activity', label: t('nav.activity') },
    ] : []),
  ];

  const adminLinks = user?.admin ? [
    { to: '/admin/users', label: t('users.title') },
    { to: '/admin/roles', label: t('roles.title') },
    { to: '/admin/groups', label: t('groups.title') },
    { to: '/admin/trackers', label: t('trackers.title') },
    { to: '/admin/statuses', label: t('statuses.title') },
    { to: '/admin/workflows', label: t('workflows.title') },
    { to: '/admin/custom-fields', label: t('customFields.title') },
    { to: '/admin/enumerations', label: t('enumerations.pageTitle') },
    { to: '/admin/settings', label: t('settings.title') },
  ] : [];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary-700 text-white shadow-md">
        <div className="max-w-screen-2xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <Link to="/" className="text-xl font-bold tracking-tight">{t('app.title')}</Link>
              <nav className="hidden md:flex items-center gap-1">
                {navLinks.map(l => (
                  <Link key={l.to} to={l.to} className="px-3 py-1.5 rounded hover:bg-primary-600 text-sm font-medium transition">{l.label}</Link>
                ))}
                {adminLinks.length > 0 && (
                  <div className="relative">
                    <button 
                      onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                      onMouseEnter={() => setAdminMenuOpen(true)}
                      className="px-3 py-1.5 rounded hover:bg-primary-600 text-sm font-medium flex items-center gap-1"
                    >
                      {t('nav.admin')} <ChevronDown size={14} />
                    </button>
                    {adminMenuOpen && (
                      <div 
                        onMouseLeave={() => setAdminMenuOpen(false)}
                        className="absolute left-0 top-full bg-white text-gray-800 rounded-lg shadow-xl py-1 min-w-48 z-50"
                      >
                        {adminLinks.map(l => (
                          <Link 
                            key={l.to} 
                            to={l.to} 
                            onClick={() => setAdminMenuOpen(false)}
                            className="block px-4 py-2 hover:bg-gray-100 text-sm"
                          >
                            {l.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <form onSubmit={handleSearch} className="hidden sm:block">
                <div className="relative">
                  <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-300" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={t('search.placeholder')}
                    className="pl-8 pr-3 py-1.5 rounded bg-primary-600 text-white placeholder-primary-300 text-sm border border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-300 w-48"
                  />
                </div>
              </form>

              {isAuthenticated ? (
                <div className="relative">
                  <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-primary-600">
                    <User size={16} />
                    <span className="text-sm hidden sm:inline">{user?.login || ''}</span>
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-white text-gray-800 rounded-lg shadow-xl py-1 min-w-44 z-50">
                      <Link to="/my/account" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 text-sm"><Settings size={14} />{t('nav.myAccount')}</Link>
                      <button onClick={() => { setUserMenuOpen(false); handleLogout(); }} className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 text-sm w-full text-left"><LogOut size={14} />{t('nav.logout')}</button>
                    </div>
                  )}
                </div>
              ) : (
                <Link to="/login" className="text-sm px-3 py-1.5 rounded bg-white text-primary-700 font-medium hover:bg-gray-100">{t('nav.login')}</Link>
              )}

              <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-1">
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>

          {menuOpen && (
            <nav className="md:hidden pb-3 space-y-1">
              {navLinks.map(l => (
                <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded hover:bg-primary-600 text-sm">{l.label}</Link>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>

      <footer className="bg-gray-100 border-t text-center text-xs text-gray-500 py-3">
        TaskNova &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}

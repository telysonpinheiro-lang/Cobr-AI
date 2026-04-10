import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearSession, getUser } from '../api.js';

export default function AdminLayout() {
  const navigate = useNavigate();
  const user = getUser();

  function logout() {
    clearSession();
    navigate('/login');
  }

  return (
    <div className="app">
      <aside className="sidebar admin-sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">⚡</span>
          <span>Cobr-AI</span>
        </div>
        <div className="admin-badge-label">Painel Admin</div>

        <nav>
          <NavLink to="/admin" end>
            <span className="nav-icon">📊</span> Visão geral
          </NavLink>
          <NavLink to="/admin/companies">
            <span className="nav-icon">🏢</span> Empresas
          </NavLink>
        </nav>

        <div className="sidebar-divider" />
        <nav>
          <NavLink to="/">
            <span className="nav-icon">↩</span> Voltar ao sistema
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{user?.name?.[0]?.toUpperCase() || 'A'}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.name}</div>
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>{user?.email}</div>
            </div>
          </div>
          <button className="secondary" style={{ width: '100%', marginTop: 12 }} onClick={logout}>
            Sair
          </button>
        </div>
      </aside>

      <main className="main admin-main">
        <Outlet />
      </main>
    </div>
  );
}

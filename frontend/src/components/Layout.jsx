import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearSession, getUser } from '../api.js';

export default function Layout() {
  const navigate = useNavigate();
  const user = getUser();

  function logout() {
    clearSession();
    navigate('/login');
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Cobr-AI</h1>
        <nav>
          <NavLink to="/" end>📊 Dashboard</NavLink>
          <NavLink to="/clients">👥 Clientes</NavLink>
          <NavLink to="/debtors">⚠️ Inadimplentes</NavLink>
          <NavLink to="/upload">📋 Cadastros</NavLink>
          <NavLink to="/settings">⚙️ Configurações</NavLink>
          {user?.isSuperAdmin && (
            <>
              <div style={{
                borderTop: '1px solid var(--border)',
                margin: '16px 0 8px',
                paddingTop: 8,
                fontSize: 10,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                paddingLeft: 12,
              }}>
                Administração
              </div>
              <NavLink to="/admin">⚡ Painel Admin</NavLink>
            </>
          )}
        </nav>
        <div style={{ marginTop: 40, color: 'var(--muted)', fontSize: 12 }}>
          {user?.email}
          {user?.isSuperAdmin && (
            <span style={{
              display: 'inline-block', marginLeft: 6,
              background: 'var(--warning)', color: '#000',
              borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
            }}>
              ADMIN
            </span>
          )}
          <br />
          <button className="secondary" style={{ marginTop: 12, width: '100%' }} onClick={logout}>
            Sair
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

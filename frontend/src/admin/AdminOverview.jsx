import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import './admin.css';

function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pct(a, b) {
  if (!b) return '0%';
  return (a / b * 100).toFixed(1) + '%';
}

// Mini barra de progresso
function Bar({ value, max, color = 'var(--accent)' }) {
  const w = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ background: '#21262d', borderRadius: 4, height: 6, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .4s' }} />
    </div>
  );
}

export default function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.adminStats(), api.adminCompanies()])
      .then(([s, c]) => { setStats(s); setCompanies(c); })
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!stats) return <p>Carregando...</p>;

  const topCompanies = [...companies]
    .sort((a, b) => Number(b.recovered) - Number(a.recovered))
    .slice(0, 5);

  const maxRecovered = Number(topCompanies[0]?.recovered || 1);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: 0 }}>Visão geral</h2>
        <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>
          Resumo do SaaS em tempo real
        </p>
      </div>

      {/* Cards */}
      <div className="stat-grid">
        <div className="stat-card green">
          <span className="sc-icon">💰</span>
          <div className="sc-label">A receber (% sobre recuperado)</div>
          <div className="sc-value">{brl(
            companies.reduce((acc, c) =>
              acc + (Number(c.recovered) * Number(c.revenue_share || 0) / 100), 0)
          )}</div>
          <div className="sc-sub">{stats.companies.active} empresa(s) ativa(s)</div>
        </div>

        <div className="stat-card blue">
          <span className="sc-icon">🏢</span>
          <div className="sc-label">Empresas</div>
          <div className="sc-value">{stats.companies.total}</div>
          <div className="sc-sub">
            {stats.companies.active} ativas · {stats.companies.suspended} suspensas
          </div>
        </div>

        <div className="stat-card green">
          <span className="sc-icon">✅</span>
          <div className="sc-label">Total recuperado</div>
          <div className="sc-value">{brl(stats.debtors.recovered)}</div>
          <div className="sc-sub">
            Taxa: {pct(stats.debtors.paid, stats.debtors.total)}
          </div>
        </div>

        <div className="stat-card yellow">
          <span className="sc-icon">👥</span>
          <div className="sc-label">Inadimplentes</div>
          <div className="sc-value">{stats.debtors.total}</div>
          <div className="sc-sub">{stats.debtors.paid} pagos</div>
        </div>

        <div className="stat-card blue">
          <span className="sc-icon">💬</span>
          <div className="sc-label">Mensagens enviadas</div>
          <div className="sc-value">{stats.messages}</div>
          <div className="sc-sub">via WhatsApp</div>
        </div>

        <div className="stat-card yellow">
          <span className="sc-icon">📈</span>
          <div className="sc-label">Conversão geral</div>
          <div className="sc-value">{pct(stats.debtors.paid, stats.debtors.total)}</div>
          <div className="sc-sub">inadimplentes → pagos</div>
        </div>
      </div>

      {/* Ranking de empresas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        <div className="admin-table-wrap">
          <div className="toolbar">
            <h3>Top empresas — recuperado</h3>
            <Link to="/admin/companies">ver todas</Link>
          </div>
          <div style={{ padding: '8px 0' }}>
            {topCompanies.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 16 }}>Sem dados</p>
            )}
            {topCompanies.map((c, i) => (
              <div key={c.id} style={{ padding: '12px 20px', borderBottom: i < topCompanies.length - 1 ? '1px solid #21262d' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: 'var(--muted)', fontSize: 11, marginRight: 8 }}>#{i + 1}</span>
                    <Link to={`/admin/companies/${c.id}`} style={{ fontWeight: 600 }}>{c.name}</Link>
                  </div>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                    {brl(c.recovered)}
                  </span>
                </div>
                <Bar value={Number(c.recovered)} max={maxRecovered} />
              </div>
            ))}
          </div>
        </div>

        <div className="admin-table-wrap">
          <div className="toolbar">
            <h3>% sobre recebido por empresa</h3>
          </div>
          <div style={{ padding: '8px 0' }}>
            {companies.slice(0, 6).map((c, i) => {
              const earn = Number(c.recovered) * Number(c.revenue_share || 0) / 100;
              return (
                <div key={c.id} style={{ padding: '10px 20px', borderBottom: i < Math.min(companies.length, 6) - 1 ? '1px solid #21262d' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{brl(earn)}</span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                    {Number(c.revenue_share || 0).toFixed(1)}% de {brl(c.recovered)} recuperado
                  </div>
                </div>
              );
            })}
            {companies.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 16 }}>Sem dados</p>
            )}
          </div>

          {/* Status */}
          <div style={{ padding: '0 20px 20px' }}>
            <div className="admin-modal-section-title" style={{ marginBottom: 12 }}>Status</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{
                flex: 1, background: 'rgba(37,211,102,.08)', border: '1px solid rgba(37,211,102,.2)',
                borderRadius: 10, padding: '14px 16px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)' }}>
                  {stats.companies.active}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Ativas</div>
              </div>
              <div style={{
                flex: 1, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
                borderRadius: 10, padding: '14px 16px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--danger)' }}>
                  {stats.companies.suspended}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Suspensas</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

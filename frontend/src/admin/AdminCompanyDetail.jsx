import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import './admin.css';

const PLANS = ['free', 'starter', 'pro'];
const WA_PROVIDERS  = ['mock', 'zapi', 'evolution'];
const PAY_PROVIDERS = ['mock', 'asaas', 'pagarme'];

function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex', borderBottom: '1px solid #21262d', marginBottom: 24, gap: 4,
    }}>
      {tabs.map(t => (
        <button key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            background: 'transparent', border: 'none', padding: '12px 20px',
            borderBottom: active === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            color: active === t.key ? 'var(--accent)' : 'var(--muted)',
            fontWeight: active === t.key ? 600 : 400,
            cursor: 'pointer', borderRadius: 0, fontSize: 14,
          }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Tab: configurações ────────────────────────────────────────────────────────
function TabSettings({ company, onSaved }) {
  const [f, setF] = useState({
    name:              company.name || '',
    revenue_share:     company.revenue_share || '',
    status:            company.status || 'active',
    whatsapp_provider: company.whatsapp_provider || '',
    payment_provider:  company.payment_provider || '',
    openai_api_key:    company.openai_api_key || '',
    openai_model:      company.openai_model || '',
  });
  const [msg, setMsg] = useState('');
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save(e) {
    e.preventDefault();
    await api.adminUpdateCompany(company.id, {
      ...f, revenue_share: Number(f.revenue_share) || 0,
    });
    setMsg('Salvo');
    setTimeout(() => setMsg(''), 2000);
    onSaved();
  }

  return (
    <form onSubmit={save}>
      <div className="admin-table-wrap" style={{ padding: 24 }}>
        <div className="admin-modal-section-title">Dados da empresa</div>
        <div className="row">
          <div className="field"><label>Nome</label>
            <input value={f.name} onChange={e => u('name', e.target.value)} required />
          </div>
          <div className="field"><label>% sobre recebido</label>
            <input type="number" min="0" max="100" step="0.1"
              value={f.revenue_share} placeholder="Ex: 5"
              onChange={e => u('revenue_share', e.target.value)} />
          </div>
          <div className="field"><label>Status</label>
            <select value={f.status} onChange={e => u('status', e.target.value)}>
              <option value="active">Ativa</option>
              <option value="suspended">Suspensa</option>
            </select>
          </div>
        </div>

        <div className="admin-modal-section-title" style={{ marginTop: 24 }}>
          Integrações por empresa
          <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>
            (sobrescreve o .env global)
          </span>
        </div>

        <div className="row">
          <div className="field">
            <label>WhatsApp provider</label>
            <select value={f.whatsapp_provider} onChange={e => u('whatsapp_provider', e.target.value)}>
              <option value="">padrão do sistema</option>
              {WA_PROVIDERS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Pagamento provider</label>
            <select value={f.payment_provider} onChange={e => u('payment_provider', e.target.value)}>
              <option value="">padrão do sistema</option>
              {PAY_PROVIDERS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label>OpenAI API Key</label>
          <input value={f.openai_api_key} placeholder="sk-... (deixe vazio para usar a chave global)"
            onChange={e => u('openai_api_key', e.target.value)} />
        </div>
        <div className="field">
          <label>Modelo OpenAI</label>
          <input value={f.openai_model} placeholder="gpt-4o-mini"
            onChange={e => u('openai_model', e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 20, alignItems: 'center' }}>
          <button type="submit">Salvar configurações</button>
          {msg && <span style={{ color: 'var(--accent)' }}>✓ {msg}</span>}
        </div>
      </div>
    </form>
  );
}

// ── Tab: usuários ─────────────────────────────────────────────────────────────
function TabUsers({ companyId, users, onRefresh }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'operator' });
  const [err, setErr]   = useState('');
  const u = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function add(e) {
    e.preventDefault();
    setErr('');
    try {
      await api.adminCreateUser(companyId, form);
      setForm({ name: '', email: '', password: '', role: 'operator' });
      onRefresh();
    } catch (ex) { setErr(ex.message); }
  }

  async function remove(uid, name) {
    if (!confirm(`Remover ${name}?`)) return;
    await api.adminDeleteUser(companyId, uid);
    onRefresh();
  }

  return (
    <div>
      <div className="admin-table-wrap" style={{ marginBottom: 20 }}>
        <div className="toolbar"><h3>Usuários ({users.length})</h3></div>
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Criado em</th><th></th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  {u.name}
                  {u.is_super_admin ? (
                    <span style={{
                      marginLeft: 6, fontSize: 10, background: 'var(--warning)',
                      color: '#000', padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                    }}>ADMIN</span>
                  ) : null}
                </td>
                <td style={{ color: 'var(--muted)' }}>{u.email}</td>
                <td><span className="tag plan">{u.role}</span></td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {new Date(u.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td>
                  {!u.is_super_admin && (
                    <button className="danger" style={{ padding: '3px 10px', fontSize: 12 }}
                      onClick={() => remove(u.id, u.name)}>
                      remover
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-table-wrap" style={{ padding: 24 }}>
        <div className="admin-modal-section-title">Adicionar usuário</div>
        <form onSubmit={add}>
          <div className="row">
            <div className="field"><label>Nome *</label>
              <input value={form.name} onChange={e => u('name', e.target.value)} required />
            </div>
            <div className="field"><label>E-mail *</label>
              <input type="email" value={form.email}
                onChange={e => u('email', e.target.value)} required />
            </div>
          </div>
          <div className="row">
            <div className="field"><label>Senha *</label>
              <input type="password" value={form.password}
                onChange={e => u('password', e.target.value)} required />
            </div>
            <div className="field"><label>Perfil</label>
              <select value={form.role} onChange={e => u('role', e.target.value)}>
                <option value="operator">Operador</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
            </div>
          </div>
          {err && <div className="error">{err}</div>}
          <button type="submit">Adicionar usuário</button>
        </form>
      </div>
    </div>
  );
}

// ── Tab: métricas ─────────────────────────────────────────────────────────────
function TabMetrics({ metrics }) {
  if (!metrics) return <p>Sem dados</p>;
  return (
    <div className="stat-grid">
      <div className="stat-card blue">
        <span className="sc-icon">👥</span>
        <div className="sc-label">Devedores cadastrados</div>
        <div className="sc-value">{metrics.debtors_count}</div>
      </div>
      <div className="stat-card yellow">
        <span className="sc-icon">💸</span>
        <div className="sc-label">Volume total</div>
        <div className="sc-value">{brl(metrics.total_amount)}</div>
      </div>
      <div className="stat-card green">
        <span className="sc-icon">✅</span>
        <div className="sc-label">Recuperado</div>
        <div className="sc-value">{brl(metrics.recovered)}</div>
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function AdminCompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData]     = useState(null);
  const [tab, setTab]       = useState('settings');
  const [error, setError]   = useState('');

  useEffect(() => { load(); }, [id]);

  async function load() {
    try { setData(await api.adminCompany(id)); }
    catch (e) { setError(e.message); }
  }

  if (error) return <div className="error">{error}</div>;
  if (!data)  return <p>Carregando...</p>;

  const { company, users, metrics } = data;
  const initial = company.name[0]?.toUpperCase() || '?';

  return (
    <div>
      <Link to="/admin/companies" style={{ color: 'var(--muted)', fontSize: 13 }}>
        ← voltar
      </Link>

      {/* Header */}
      <div className="company-header" style={{ marginTop: 16 }}>
        <div className="company-avatar">{initial}</div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0 }}>{company.name}</h2>
            <span className={`tag ${company.status}`}>
              {company.status === 'active' ? '● Ativa' : '● Suspensa'}
            </span>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            ID #{company.id} · {users.length} usuário(s) · {Number(company.revenue_share || 0).toFixed(1)}% sobre recebido
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {company.status === 'active'
            ? <button className="danger" onClick={async () => {
                if (!confirm('Suspender empresa?')) return;
                await api.adminSuspendCompany(company.id);
                load();
              }}>Suspender</button>
            : <button onClick={async () => {
                await api.adminUpdateCompany(company.id, { status: 'active' });
                load();
              }}>Reativar</button>
          }
          <button className="danger" onClick={async () => {
            if (!confirm(`⚠️ Excluir permanentemente "${company.name}"?\n\nRemove empresa, usuários, devedores e histórico. Irreversível.`)) return;
            await api.adminDestroyCompany(company.id);
            navigate('/admin/companies');
          }}>🗑 Excluir</button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'settings', label: '⚙️  Configurações' },
          { key: 'users',    label: `👤  Usuários (${users.length})` },
          { key: 'metrics',  label: '📊  Métricas' },
        ]}
      />

      {tab === 'settings' && <TabSettings company={company} onSaved={load} />}
      {tab === 'users'    && <TabUsers companyId={company.id} users={users} onRefresh={load} />}
      {tab === 'metrics'  && <TabMetrics metrics={metrics} />}
    </div>
  );
}

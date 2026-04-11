import { useEffect, useState } from 'react';
import { api } from '../api.js';

const PLANS = ['free', 'starter', 'pro'];
const WA_PROVIDERS  = ['mock', 'zapi', 'evolution'];
const PAY_PROVIDERS = ['mock', 'asaas', 'pagarme'];

function brl(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
}

// ─── Modal genérico ──────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
    }}>
      <div style={{
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 28, width: 560, maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="secondary" style={{ padding: '4px 12px' }} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Modal: Criar empresa ────────────────────────────────────────────────────
function CreateCompanyModal({ onClose, onCreated }) {
  const [f, setF] = useState({
    name: '', plan: 'starter', monthly_price: '',
    owner_name: '', owner_email: '', owner_password: '',
    whatsapp_provider: '', payment_provider: '', openai_api_key: '', openai_model: '',
  });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const u = (k, v) => setF({ ...f, [k]: v });

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      await api.adminCreateCompany({ ...f, monthly_price: Number(f.monthly_price) || 0 });
      onCreated();
      onClose();
    } catch (ex) { setErr(ex.message); }
    finally { setLoading(false); }
  }

  return (
    <Modal title="Nova empresa" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Nome da empresa *</label>
          <input value={f.name} onChange={e => u('name', e.target.value)} required /></div>

        <div className="row">
          <div className="field"><label>Plano</label>
            <select value={f.plan} onChange={e => u('plan', e.target.value)}>
              {PLANS.map(p => <option key={p}>{p}</option>)}
            </select></div>
          <div className="field"><label>Mensalidade (R$)</label>
            <input type="number" value={f.monthly_price}
              onChange={e => u('monthly_price', e.target.value)} placeholder="0,00" /></div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
        <p style={{ color: 'var(--muted)', margin: '0 0 12px' }}>Usuário responsável (owner)</p>

        <div className="field"><label>Nome *</label>
          <input value={f.owner_name} onChange={e => u('owner_name', e.target.value)} required /></div>
        <div className="row">
          <div className="field"><label>E-mail *</label>
            <input type="email" value={f.owner_email} onChange={e => u('owner_email', e.target.value)} required /></div>
          <div className="field"><label>Senha *</label>
            <input type="password" value={f.owner_password} onChange={e => u('owner_password', e.target.value)} required /></div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
        <p style={{ color: 'var(--muted)', margin: '0 0 12px' }}>Integrações (opcional — sobrescreve o .env)</p>

        <div className="row">
          <div className="field"><label>WhatsApp provider</label>
            <select value={f.whatsapp_provider} onChange={e => u('whatsapp_provider', e.target.value)}>
              <option value="">padrão do sistema</option>
              {WA_PROVIDERS.map(p => <option key={p}>{p}</option>)}
            </select></div>
          <div className="field"><label>Pagamento provider</label>
            <select value={f.payment_provider} onChange={e => u('payment_provider', e.target.value)}>
              <option value="">padrão do sistema</option>
              {PAY_PROVIDERS.map(p => <option key={p}>{p}</option>)}
            </select></div>
        </div>
        <div className="field"><label>OpenAI API Key</label>
          <input value={f.openai_api_key} onChange={e => u('openai_api_key', e.target.value)} placeholder="sk-... (deixe vazio p/ usar a chave global)" /></div>
        <div className="field"><label>Modelo OpenAI</label>
          <input value={f.openai_model} onChange={e => u('openai_model', e.target.value)} placeholder="gpt-4o-mini" /></div>

        {err && <div className="error">{err}</div>}
        <button type="submit" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
          {loading ? 'Criando...' : 'Criar empresa'}
        </button>
      </form>
    </Modal>
  );
}

// ─── Modal: Editar empresa ───────────────────────────────────────────────────
function EditCompanyModal({ company, onClose, onSaved }) {
  const [f, setF] = useState({
    name: company.name || '',
    plan: company.plan || 'free',
    monthly_price: company.monthly_price || '',
    status: company.status || 'active',
    whatsapp_provider: company.whatsapp_provider || '',
    payment_provider: company.payment_provider || '',
    openai_api_key: company.openai_api_key || '',
    openai_model: company.openai_model || '',
  });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'operator' });
  const [detail, setDetail] = useState(null);
  const u = (k, v) => setF({ ...f, [k]: v });
  const un = (k, v) => setNewUser({ ...newUser, [k]: v });

  useEffect(() => {
    api.adminCompany(company.id).then(setDetail);
  }, [company.id]);

  async function save(e) {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      await api.adminUpdateCompany(company.id, { ...f, monthly_price: Number(f.monthly_price) || 0 });
      onSaved();
      onClose();
    } catch (ex) { setErr(ex.message); }
    finally { setLoading(false); }
  }

  async function addUser(e) {
    e.preventDefault();
    try {
      await api.adminCreateUser(company.id, newUser);
      setNewUser({ name: '', email: '', password: '', role: 'operator' });
      api.adminCompany(company.id).then(setDetail);
    } catch (ex) { alert(ex.message); }
  }

  async function removeUser(uid) {
    if (!confirm('Remover usuário?')) return;
    await api.adminDeleteUser(company.id, uid);
    api.adminCompany(company.id).then(setDetail);
  }

  return (
    <Modal title={`Editar: ${company.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field"><label>Nome da empresa</label>
          <input value={f.name} onChange={e => u('name', e.target.value)} required /></div>

        <div className="row">
          <div className="field"><label>Plano</label>
            <select value={f.plan} onChange={e => u('plan', e.target.value)}>
              {PLANS.map(p => <option key={p}>{p}</option>)}
            </select></div>
          <div className="field"><label>Mensalidade (R$)</label>
            <input type="number" value={f.monthly_price}
              onChange={e => u('monthly_price', e.target.value)} /></div>
          <div className="field"><label>Status</label>
            <select value={f.status} onChange={e => u('status', e.target.value)}>
              <option value="active">Ativa</option>
              <option value="suspended">Suspensa</option>
            </select></div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
        <p style={{ color: 'var(--muted)', margin: '0 0 12px' }}>Integrações</p>

        <div className="row">
          <div className="field"><label>WhatsApp provider</label>
            <select value={f.whatsapp_provider} onChange={e => u('whatsapp_provider', e.target.value)}>
              <option value="">padrão do sistema</option>
              {WA_PROVIDERS.map(p => <option key={p}>{p}</option>)}
            </select></div>
          <div className="field"><label>Pagamento provider</label>
            <select value={f.payment_provider} onChange={e => u('payment_provider', e.target.value)}>
              <option value="">padrão do sistema</option>
              {PAY_PROVIDERS.map(p => <option key={p}>{p}</option>)}
            </select></div>
        </div>
        <div className="field"><label>OpenAI API Key</label>
          <input value={f.openai_api_key} onChange={e => u('openai_api_key', e.target.value)}
            placeholder="sk-... (deixe vazio p/ usar a chave global)" /></div>
        <div className="field"><label>Modelo OpenAI</label>
          <input value={f.openai_model} onChange={e => u('openai_model', e.target.value)}
            placeholder="gpt-4o-mini" /></div>

        {err && <div className="error">{err}</div>}
        <button type="submit" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
          {loading ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </form>

      {/* Usuários */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />
      <h4 style={{ margin: '0 0 12px' }}>Usuários</h4>
      {detail && (
        <table style={{ marginBottom: 16 }}>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th></th></tr></thead>
          <tbody>
            {detail.users.map(u => (
              <tr key={u.id}>
                <td>{u.name}{u.is_super_admin ? ' ⭐' : ''}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  {!u.is_super_admin && (
                    <button className="danger" style={{ padding: '2px 8px', fontSize: 11 }}
                      onClick={() => removeUser(u.id)}>
                      remover
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={addUser} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ color: 'var(--muted)', margin: 0, fontSize: 12 }}>Adicionar usuário</p>
        <div className="row">
          <input placeholder="Nome" value={newUser.name} onChange={e => un('name', e.target.value)} required />
          <input placeholder="E-mail" type="email" value={newUser.email} onChange={e => un('email', e.target.value)} required />
        </div>
        <div className="row">
          <input placeholder="Senha" type="password" value={newUser.password} onChange={e => un('password', e.target.value)} required />
          <select value={newUser.role} onChange={e => un('role', e.target.value)}>
            <option value="operator">Operador</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
          <button type="submit" style={{ flex: 0 }}>Adicionar</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Página principal Admin ──────────────────────────────────────────────────
export default function Admin() {
  const [stats, setStats] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // company obj

  useEffect(() => { load(); }, []);

  async function load() {
    const [s, c] = await Promise.all([api.adminStats(), api.adminCompanies()]);
    setStats(s);
    setCompanies(c);
  }

  async function search() {
    setCompanies(await api.adminCompanies(q ? { q } : {}));
  }

  async function suspend(company) {
    if (!confirm(`Suspender "${company.name}"?`)) return;
    await api.adminSuspendCompany(company.id);
    load();
  }

  async function reactivate(company) {
    await api.adminUpdateCompany(company.id, { status: 'active' });
    load();
  }

  return (
    <div>
      <h2>Painel Administrativo</h2>

      {/* Estatísticas globais */}
      {stats && (
        <div className="cards" style={{ marginBottom: 24 }}>
          <div className="card success">
            <div className="label">MRR</div>
            <div className="value">{brl(stats.companies.mrr)}</div>
          </div>
          <div className="card">
            <div className="label">Empresas ativas</div>
            <div className="value">{stats.companies.active}</div>
          </div>
          <div className="card warning">
            <div className="label">Empresas suspensas</div>
            <div className="value">{stats.companies.suspended}</div>
          </div>
          <div className="card success">
            <div className="label">Total recuperado</div>
            <div className="value">{brl(stats.debtors.recovered)}</div>
          </div>
          <div className="card">
            <div className="label">Inadimplentes</div>
            <div className="value">{stats.debtors.total}</div>
          </div>
          <div className="card">
            <div className="label">Mensagens enviadas</div>
            <div className="value">{stats.messages}</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="panel">
        <div className="row" style={{ marginBottom: 16 }}>
          <input
            placeholder="Buscar empresa..."
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
          />
          <button onClick={search} style={{ flex: 0 }}>Buscar</button>
          <button onClick={() => setCreating(true)} style={{ flex: 0 }}>+ Nova empresa</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Empresa</th>
              <th>Plano</th>
              <th>Mensalidade</th>
              <th>Devedores</th>
              <th>Recuperado</th>
              <th>WA Provider</th>
              <th>Pay Provider</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {companies.map(c => (
              <tr key={c.id}>
                <td style={{ color: 'var(--muted)' }}>#{c.id}</td>
                <td>
                  <strong>{c.name}</strong>
                  <br />
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>{c.users_count} usuário(s)</span>
                </td>
                <td><span className="badge nao_contatado">{c.plan}</span></td>
                <td>{brl(c.monthly_price)}</td>
                <td>{c.debtors_count}</td>
                <td style={{ color: 'var(--accent)' }}>{brl(c.recovered)}</td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {c.whatsapp_provider || 'padrão'}
                </td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {c.payment_provider || 'padrão'}
                </td>
                <td>
                  <span className={`badge ${c.status === 'active' ? 'pago' : 'ignorado'}`}>
                    {c.status === 'active' ? 'ativa' : 'suspensa'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="secondary" style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => setEditing(c)}>
                      editar
                    </button>
                    {c.status === 'active'
                      ? <button className="danger" style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => suspend(c)}>
                          suspender
                        </button>
                      : <button className="secondary" style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => reactivate(c)}>
                          reativar
                        </button>
                    }
                  </div>
                </td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr><td colSpan="10" style={{ textAlign: 'center', color: 'var(--muted)' }}>
                Nenhuma empresa encontrada.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateCompanyModal
          onClose={() => setCreating(false)}
          onCreated={load}
        />
      )}
      {editing && (
        <EditCompanyModal
          company={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

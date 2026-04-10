import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import './admin.css';

const PLANS = ['free', 'starter', 'pro'];
const WA_PROVIDERS  = ['mock', 'zapi', 'evolution'];
const PAY_PROVIDERS = ['mock', 'asaas', 'pagarme'];

function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="admin-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="admin-modal">
        <div className="admin-modal-header">
          <h3>{title}</h3>
          <button className="secondary" style={{ padding: '4px 14px' }} onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>
  );
}

// ── Modal: criar empresa ──────────────────────────────────────────────────────
function CreateModal({ onClose, onCreated }) {
  const [f, setF] = useState({
    name: '', revenue_share: '',
    owner_name: '', owner_email: '', owner_password: '',
    whatsapp_provider: '', payment_provider: '',
    openai_api_key: '', openai_model: '',
  });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      await api.adminCreateCompany({ ...f, revenue_share: Number(f.revenue_share) || 0 });
      onCreated();
      onClose();
    } catch (ex) { setErr(ex.message); }
    finally { setLoading(false); }
  }

  return (
    <Modal title="Nova empresa" onClose={onClose}>
      <form onSubmit={submit}>

        <div className="admin-modal-section-title">Dados da empresa</div>
        <div className="row">
          <div className="field"><label>Nome *</label>
            <input value={f.name} onChange={e => u('name', e.target.value)} required />
          </div>
          <div className="field"><label>% sobre recebido</label>
            <input type="number" min="0" max="100" step="0.1"
              value={f.revenue_share} placeholder="Ex: 5"
              onChange={e => u('revenue_share', e.target.value)} />
          </div>
        </div>

        <div className="admin-modal-section-title" style={{ marginTop: 20 }}>Usuário responsável (owner)</div>
        <div className="field"><label>Nome completo *</label>
          <input value={f.owner_name} onChange={e => u('owner_name', e.target.value)} required />
        </div>
        <div className="row">
          <div className="field"><label>E-mail *</label>
            <input type="email" value={f.owner_email}
              onChange={e => u('owner_email', e.target.value)} required />
          </div>
          <div className="field"><label>Senha *</label>
            <input type="password" value={f.owner_password}
              onChange={e => u('owner_password', e.target.value)} required />
          </div>
        </div>

        <div className="admin-modal-section-title" style={{ marginTop: 20 }}>
          Integrações <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(opcional — sobrescreve o .env)</span>
        </div>
        <div className="row">
          <div className="field"><label>WhatsApp</label>
            <select value={f.whatsapp_provider} onChange={e => u('whatsapp_provider', e.target.value)}>
              <option value="">padrão do sistema</option>
              {WA_PROVIDERS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="field"><label>Pagamento</label>
            <select value={f.payment_provider} onChange={e => u('payment_provider', e.target.value)}>
              <option value="">padrão do sistema</option>
              {PAY_PROVIDERS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="field"><label>OpenAI API Key</label>
          <input value={f.openai_api_key} placeholder="sk-..."
            onChange={e => u('openai_api_key', e.target.value)} />
        </div>
        <div className="field"><label>Modelo OpenAI</label>
          <input value={f.openai_model} placeholder="gpt-4o-mini"
            onChange={e => u('openai_model', e.target.value)} />
        </div>

        {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="submit" disabled={loading} style={{ flex: 1 }}>
            {loading ? 'Criando...' : 'Criar empresa'}
          </button>
          <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Modal: editar empresa ─────────────────────────────────────────────────────
function EditModal({ company, onClose, onSaved }) {
  const [f, setF] = useState({
    name:               company.name || '',
    revenue_share:      company.revenue_share || '',
    status:             company.status || 'active',
    whatsapp_provider:  company.whatsapp_provider || '',
    payment_provider:   company.payment_provider || '',
    openai_api_key:     company.openai_api_key || '',
    openai_model:       company.openai_model || '',
  });
  const [err, setErr]       = useState('');
  const [loading, setLoad]  = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setLoad(true); setErr('');
    try {
      await api.adminUpdateCompany(company.id, {
        ...f, revenue_share: Number(f.revenue_share) || 0,
      });
      onSaved();
      onClose();
    } catch (ex) { setErr(ex.message); }
    finally { setLoad(false); }
  }

  return (
    <Modal title={`Editar: ${company.name}`} onClose={onClose}>
      <form onSubmit={save}>

        <div className="admin-modal-section-title">Dados</div>
        <div className="row">
          <div className="field"><label>Nome da empresa</label>
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

        <div className="admin-modal-section-title" style={{ marginTop: 20 }}>Integrações</div>
        <div className="row">
          <div className="field"><label>WhatsApp</label>
            <select value={f.whatsapp_provider} onChange={e => u('whatsapp_provider', e.target.value)}>
              <option value="">padrão do sistema</option>
              {WA_PROVIDERS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="field"><label>Pagamento</label>
            <select value={f.payment_provider} onChange={e => u('payment_provider', e.target.value)}>
              <option value="">padrão do sistema</option>
              {PAY_PROVIDERS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="field"><label>OpenAI API Key</label>
          <input value={f.openai_api_key} placeholder="sk-..."
            onChange={e => u('openai_api_key', e.target.value)} />
        </div>
        <div className="field"><label>Modelo OpenAI</label>
          <input value={f.openai_model} placeholder="gpt-4o-mini"
            onChange={e => u('openai_model', e.target.value)} />
        </div>

        {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="submit" disabled={loading} style={{ flex: 1 }}>
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
          <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function AdminCompanies() {
  const [companies, setCompanies] = useState([]);
  const [q, setQ]                 = useState('');
  const [creating, setCreating]   = useState(false);
  const [editing, setEditing]     = useState(null);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  async function load(search = q) {
    setCompanies(await api.adminCompanies(search ? { q: search } : {}));
  }

  async function suspend(c) {
    if (!confirm(`Suspender "${c.name}"? O acesso ao sistema será bloqueado.`)) return;
    await api.adminSuspendCompany(c.id);
    load();
  }

  async function reactivate(c) {
    await api.adminUpdateCompany(c.id, { status: 'active' });
    load();
  }

  async function destroy(c) {
    if (!confirm(`⚠️ Excluir permanentemente "${c.name}"?\n\nIsso remove a empresa, todos os usuários, devedores, mensagens e pagamentos. Ação irreversível.`)) return;
    await api.adminDestroyCompany(c.id);
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h2 style={{ margin: 0 }}>Empresas</h2>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>
            {companies.length} empresa(s) cadastrada(s)
          </p>
        </div>
        <button onClick={() => setCreating(true)}>+ Nova empresa</button>
      </div>

      <div className="admin-table-wrap">
        <div className="toolbar">
          <h3 style={{ margin: 0, flex: 1 }}>Todas as empresas</h3>
          <input
            style={{ width: 240 }}
            placeholder="Buscar..."
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load(q)}
          />
          <button className="secondary" onClick={() => load(q)}>Buscar</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>% Recebido</th>
              <th>Usuários</th>
              <th>Devedores</th>
              <th>Recuperado</th>
              <th>WhatsApp</th>
              <th>Pagamento</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {companies.map(c => (
              <tr key={c.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>
                    <Link to={`/admin/companies/${c.id}`}>{c.name}</Link>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 11 }}>ID #{c.id}</div>
                </td>
                <td style={{ fontWeight: 600, color: 'var(--accent)' }}>
                  {Number(c.revenue_share || 0).toFixed(1)}%
                </td>
                <td>{c.users_count}</td>
                <td>{c.debtors_count}</td>
                <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{brl(c.recovered)}</td>
                <td>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 6,
                    background: '#21262d', color: 'var(--muted)',
                  }}>
                    {c.whatsapp_provider || 'padrão'}
                  </span>
                </td>
                <td>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 6,
                    background: '#21262d', color: 'var(--muted)',
                  }}>
                    {c.payment_provider || 'padrão'}
                  </span>
                </td>
                <td>
                  <span className={`tag ${c.status === 'active' ? 'active' : 'suspended'}`}>
                    {c.status === 'active' ? '● Ativa' : '● Suspensa'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="secondary" style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => navigate(`/admin/companies/${c.id}`)}>
                      detalhe
                    </button>
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
                    <button className="danger" style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => destroy(c)}>
                      🗑
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr><td colSpan="10" style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
                Nenhuma empresa encontrada.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={() => load()} />}
      {editing  && <EditModal company={editing} onClose={() => setEditing(null)} onSaved={() => load()} />}
    </div>
  );
}
